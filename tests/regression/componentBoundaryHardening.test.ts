import { describe, expect, it } from 'vitest'
import {
  OpticalSceneSchema,
  componentToGeometryCandidate,
  createInitialOpticalRay,
  createSequentialRayIdGenerator,
  intersectRayWithPrimitive,
  interactWithComponent,
  rotate,
  scale,
  subtract,
  traceOpticalScene,
  vec2,
  type OpticalComponent,
  type Vec2,
} from '../../src/core/optics'
import { DEFAULT_SIMULATION_CONFIGURATION } from '../fixtures/defaultRamanScene'
import { hardeningComponent } from '../fixtures/hardeningScenes'

const interact = (
  component: OpticalComponent,
  origin: Vec2,
  direction: Vec2,
) => {
  if (component.type === 'laser') throw new TypeError('Laser is not a target.')
  const ids = createSequentialRayIdGenerator()
  const ray = createInitialOpticalRay({
    rayId: ids.next(),
    sourceComponentId: component.id,
    origin,
    direction,
    wavelength_nm: 532,
    power_mw: 10,
  })
  const candidate = componentToGeometryCandidate(component)!
  const hit = intersectRayWithPrimitive(ray.geometry, candidate.primitive)!
  return interactWithComponent(ray, component, hit, {
    nextRayId: () => ids.next(),
    rayOriginOffset_mm:
      DEFAULT_SIMULATION_CONFIGURATION.ray_origin_offset_mm,
  })
}

describe('Pinhole baffle/opening hardening', () => {
  const pinhole = hardeningComponent(
    'component:pinhole',
    'pinhole',
    10,
    0,
    90,
    10,
    { model: 'geometric-aperture' },
  )

  it.each([
    { offset_mm: 0, outcome: 'aperture-pass' },
    { offset_mm: 3, outcome: 'aperture-pass' },
    { offset_mm: 5, outcome: 'aperture-pass' },
    { offset_mm: 5 - 2e-7, outcome: 'aperture-pass' },
    { offset_mm: 5 + 2e-7, outcome: 'aperture-blocked' },
    { offset_mm: 20, outcome: 'aperture-blocked' },
  ])('resolves opening offset $offset_mm mm', ({ offset_mm, outcome }) => {
    const result = interact(pinhole, vec2(0, offset_mm), vec2(1, 0))
    expect(result.outcome).toBe(outcome)
  })

  it('works for a rotated aperture and reverse incidence', () => {
    const rotated = hardeningComponent(
      'component:pinhole-rotated',
      'pinhole',
      10,
      0,
      45,
      10,
      { model: 'geometric-aperture' },
    )
    const candidate = componentToGeometryCandidate(rotated)!
    if (candidate.primitive.kind !== 'aperture-plane') {
      throw new Error('Expected aperture plane.')
    }
    const { center, normal, tangent } = candidate.primitive
    const forwardOrigin = addVectors(
      subtract(center, scale(normal, 10)),
      scale(tangent, 3),
    )
    const reverseOrigin = addVectors(
      addVectors(center, scale(normal, 10)),
      scale(tangent, -3),
    )

    expect(interact(rotated, forwardOrigin, normal).outcome).toBe(
      'aperture-pass',
    )
    expect(interact(rotated, reverseOrigin, scale(normal, -1)).outcome).toBe(
      'aperture-pass',
    )
  })
})

const addVectors = (left: Vec2, right: Vec2) =>
  vec2(left.x + right.x, left.y + right.y)

describe('simplified Prism hardening', () => {
  const prism = (deflection_angle_deg: number, rotation_deg = 90) =>
    hardeningComponent(
      `component:prism:${deflection_angle_deg}:${rotation_deg}`,
      'prism',
      10,
      0,
      rotation_deg,
      100,
      { deflection_angle_deg },
    )

  it('supports zero, positive, and negative configured deflection', () => {
    const zero = interact(prism(0), vec2(0, 0), vec2(1, 0))
    const positive = interact(prism(40), vec2(0, 0), vec2(1, 0))
    const negative = interact(prism(-20), vec2(0, 0), vec2(1, 0))

    expect(zero.outgoingRays[0]?.geometry.direction).toEqual({ x: 1, y: 0 })
    expect(positive.metadata).toMatchObject({ signedDeflection_deg: 40 })
    expect(positive.outgoingRays[0]?.geometry.direction.y).toBeGreaterThan(0)
    expect(negative.metadata).toMatchObject({ signedDeflection_deg: -20 })
    expect(negative.outgoingRays[0]?.geometry.direction.y).toBeLessThan(0)
  })

  it('handles rotated and reverse-side incidence deterministically', () => {
    const rotated = prism(40, 45)
    const reverse = prism(40)
    const first = interact(rotated, vec2(0, 0), vec2(1, 0))
    const repeated = interact(rotated, vec2(0, 0), vec2(1, 0))
    const reverseResult = interact(reverse, vec2(20, 0), vec2(-1, 0))

    expect(first).toEqual(repeated)
    expect(first.metadata).toMatchObject({ signedDeflection_deg: 40 })
    expect(reverseResult.metadata).toMatchObject({ signedDeflection_deg: -40 })
  })
})

describe('Spectrometer acceptance boundary hardening', () => {
  const spectrometer = hardeningComponent(
    'component:spectrometer',
    'spectrometer',
    10,
    0,
    90,
    100,
    { optical_throughput: 0.75, acceptance_half_angle_deg: 10 },
  )

  const atAngle = (angle_deg: number) => {
    const direction = rotate(vec2(1, 0), angle_deg)
    const center = vec2(10, 0)
    return interact(spectrometer, subtract(center, scale(direction, 10)), direction)
  }

  it.each([
    { angle_deg: 0, accepted: true },
    { angle_deg: 10, accepted: true },
    { angle_deg: 10 - 1e-8, accepted: true },
    { angle_deg: 10 + 1e-8, accepted: false },
  ])('resolves acceptance at $angle_deg°', ({ angle_deg, accepted }) => {
    const result = atAngle(angle_deg)
    expect(result.metadata).toMatchObject({ accepted })
    expect(result.power.detected_power_mw).toBeCloseTo(accepted ? 7.5 : 0, 12)
    expect(result.terminationReason).toBe(
      accepted ? 'detected' : 'rejected-by-acceptance',
    )
  })

  it('accepts opposite-side axial incidence', () => {
    expect(interact(spectrometer, vec2(20, 0), vec2(-1, 0)).metadata).toMatchObject({
      incidenceAngle_deg: 0,
      accepted: true,
    })
  })

  it('does not report a rejected ray as successful detector termination', () => {
    const direction = rotate(vec2(1, 0), 11)
    const origin = subtract(vec2(10, 0), scale(direction, 10))
    const scene = OpticalSceneSchema.parse({
      breadboards: [],
      components: [
        hardeningComponent(
          'component:rejected-laser',
          'laser',
          origin.x,
          origin.y,
          11,
          1,
          { wavelength_nm: 532, power_mw: 10 },
        ),
        spectrometer,
      ],
    })
    const result = traceOpticalScene(scene, DEFAULT_SIMULATION_CONFIGURATION)

    expect(result.events.at(-1)).toMatchObject({
      kind: 'termination',
      reason: 'rejected-by-acceptance',
    })
    expect(
      result.events.some(
        (event) =>
          event.kind === 'termination' && event.reason === 'detected',
      ),
    ).toBe(false)
  })
})
