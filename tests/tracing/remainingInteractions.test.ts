import { describe, expect, it } from 'vitest'
import {
  OpticalComponentSchema,
  OpticalSceneSchema,
  SimulationConfigurationSchema,
  componentToGeometryCandidate,
  createChildOpticalRay,
  createInitialOpticalRay,
  createSequentialRayIdGenerator,
  intersectRayWithPrimitive,
  interactWithComponent,
  rotate,
  traceOpticalScene,
  vec2,
  type OpticalComponent,
  type OpticalRayKind,
  type RayIdGenerator,
} from '../../src/core/optics'
import {
  DEFAULT_RAMAN_SCENE,
  DEFAULT_SIMULATION_CONFIGURATION,
} from '../fixtures/defaultRamanScene'

const visualization = {
  beam_height_mm: 50,
  post_height_mm: 50,
  visual_depth_mm: 20,
  holder: true,
} as const

const component = (
  id: string,
  type: OpticalComponent['type'],
  parameters: object,
  rotation_deg = 90,
  aperture_mm = 100,
) =>
  OpticalComponentSchema.parse({
    id,
    type,
    name: id,
    enabled: true,
    transform: { x_mm: 10, y_mm: 0, rotation_deg },
    geometry: { aperture_mm },
    visualization,
    metadata: { source: 'phase-1d-test' },
    parameters,
  })

const sourceId = DEFAULT_RAMAN_SCENE.components.find(
  (item) => item.type === 'laser',
)!.id

const incoming = (
  origin = vec2(0, 0),
  direction = vec2(1, 0),
  power_mw = 10,
  kind: OpticalRayKind = 'excitation',
) => {
  const generator = createSequentialRayIdGenerator()
  return {
    generator,
    ray: createInitialOpticalRay({
      rayId: generator.next(),
      sourceComponentId: sourceId,
      origin,
      direction,
      wavelength_nm: 532,
      power_mw,
      kind,
    }),
  }
}

const runInteraction = (
  opticalComponent: OpticalComponent,
  ray: ReturnType<typeof incoming>['ray'],
  generator: RayIdGenerator,
) => {
  if (opticalComponent.type === 'laser') {
    throw new TypeError('Laser is not an interaction target.')
  }
  const candidate = componentToGeometryCandidate(opticalComponent)
  if (!candidate) throw new Error('Expected a geometry candidate.')
  const hit = intersectRayWithPrimitive(ray.geometry, candidate.primitive)
  if (!hit) throw new Error('Expected the test ray to hit the component.')
  return interactWithComponent(ray, opticalComponent, hit, {
    nextRayId: () => generator.next(),
    rayOriginOffset_mm:
      DEFAULT_SIMULATION_CONFIGURATION.ray_origin_offset_mm,
  })
}

describe('Dichroic routing', () => {
  const dichroic = component('component:test-dichroic', 'dichroic', {
    excitation_reflectivity: 0.5,
    excitation_transmission: 0.25,
    raman_transmission: 0.8,
  })

  it('routes excitation in transmitted-then-reflected deterministic order', () => {
    const { ray, generator } = incoming()
    const result = runInteraction(dichroic, ray, generator)

    expect(result.outgoingRays.map((child) => child.rayId)).toEqual([
      'ray:000002',
      'ray:000003',
    ])
    expect(result.outgoingRays.map((child) => child.power_mw)).toEqual([2.5, 5])
    expect(result.outgoingRays.map((child) => child.wavelength_nm)).toEqual([
      532, 532,
    ])
    expect(result.outgoingRays[0]?.geometry.direction).toEqual({ x: 1, y: 0 })
    expect(result.outgoingRays[1]?.geometry.direction.x).toBeCloseTo(-1, 12)
    expect(result.outgoingRays[1]?.geometry.direction.y).toBeCloseTo(0, 12)
    expect(result.metadata).toMatchObject({
      kind: 'dichroic-routing',
      incidenceSide: 'front',
      branchOrder: ['transmitted', 'reflected'],
    })
    expect(result.power).toEqual({
      incoming_power_mw: 10,
      outgoing_power_mw: 7.5,
      detected_power_mw: 0,
      lost_power_mw: 2.5,
    })
  })

  it('transmits only the sample-return placeholder', () => {
    const { ray, generator } = incoming(
      vec2(0, 0),
      vec2(1, 0),
      10,
      'sample-return-placeholder',
    )
    const result = runInteraction(dichroic, ray, generator)

    expect(result.outgoingRays).toHaveLength(1)
    expect(result.outgoingRays[0]?.geometry.direction).toEqual({ x: 1, y: 0 })
    expect(result.outgoingRays[0]?.power_mw).toBe(8)
    expect(result.power.lost_power_mw).toBe(2)
  })

  it('reports back-side incidence without changing deterministic routing', () => {
    const { ray, generator } = incoming(vec2(20, 0), vec2(-1, 0))
    const result = runInteraction(dichroic, ray, generator)

    expect(result.metadata).toMatchObject({ incidenceSide: 'back' })
    expect(result.outgoingRays[0]?.geometry.direction).toEqual({ x: -1, y: 0 })
    expect(result.outgoingRays[1]?.geometry.direction.x).toBeCloseTo(1, 12)
  })
})

describe('Objective focus metadata', () => {
  const objective = component('component:test-objective', 'objective', {
    focal_length_mm: 75,
    numerical_aperture: 0.25,
  })

  it('passes through and attaches focal context', () => {
    const { ray, generator } = incoming()
    const result = runInteraction(objective, ray, generator)
    const child = result.outgoingRays[0]!

    expect(result.outcome).toBe('objective-pass')
    expect(child.geometry.direction).toEqual(ray.geometry.direction)
    expect(child.focusMetadata).toMatchObject({
      objectiveComponentId: objective.id,
      objectivePosition_mm: { x: 10, y: 0 },
      targetFocalDistance_mm: 75,
    })
    expect(result.power.lost_power_mw).toBe(0)
  })

  it('preserves the lineage focus context on the reverse pass', () => {
    const first = incoming()
    const forward = runInteraction(objective, first.ray, first.generator)
      .outgoingRays[0]!
    const returning = createChildOpticalRay(forward, {
      rayId: first.generator.next(),
      origin: vec2(20, 0),
      direction: vec2(-1, 0),
      power_mw: forward.power_mw,
      kind: 'sample-return-placeholder',
    })
    const reverse = runInteraction(objective, returning, first.generator)

    expect(reverse.outgoingRays[0]?.geometry.direction).toEqual({ x: -1, y: 0 })
    expect(reverse.outgoingRays[0]?.focusMetadata).toEqual(
      forward.focusMetadata,
    )
  })
})

describe('Filter AOI transmission', () => {
  const filter = component('component:test-filter', 'filter', {
    raman_transmission: 0.8,
    rayleigh_suppression_od: 6,
    leakage_model: 'angle-dependent',
    leakage_midpoint_aoi_deg: 26,
    leakage_transition_width_deg: 2,
  })

  it('has low nominal excitation leakage and greater off-axis leakage', () => {
    const nominalInput = incoming()
    const nominal = runInteraction(
      filter,
      nominalInput.ray,
      nominalInput.generator,
    )
    const offAxisInput = incoming(
      vec2(0, 0),
      rotate(vec2(1, 0), 40),
    )
    const offAxis = runInteraction(
      filter,
      offAxisInput.ray,
      offAxisInput.generator,
    )

    expect(nominal.metadata).toMatchObject({ incidenceAngle_deg: 0 })
    expect(nominal.outgoingRays[0]!.power_mw).toBeLessThan(0.001)
    expect(
      offAxis.metadata?.kind === 'filter-aoi'
        ? offAxis.metadata.incidenceAngle_deg
        : Number.NaN,
    ).toBeCloseTo(40, 12)
    expect(offAxis.outgoingRays[0]!.power_mw).toBeGreaterThan(9)
    expect(offAxis.outgoingRays[0]!.power_mw).toBeLessThanOrEqual(10)
    expect(nominal.power.lost_power_mw).toBeGreaterThan(9.999)
  })

  it('applies configured sample-return transmission', () => {
    const input = incoming(
      vec2(0, 0),
      vec2(1, 0),
      10,
      'sample-return-placeholder',
    )
    const result = runInteraction(filter, input.ray, input.generator)
    expect(result.outgoingRays[0]?.power_mw).toBe(8)
    expect(result.power.lost_power_mw).toBe(2)
  })

  it('feeds an attenuated ray into the tracer minimum-power termination', () => {
    const laser = DEFAULT_RAMAN_SCENE.components.find(
      (item) => item.type === 'laser',
    )!
    const scene = OpticalSceneSchema.parse({
      breadboards: [],
      components: [
        {
          ...laser,
          transform: { x_mm: 0, y_mm: 0, rotation_deg: 0 },
        },
        filter,
      ],
    })
    const configuration = SimulationConfigurationSchema.parse({
      ...DEFAULT_SIMULATION_CONFIGURATION,
      min_ray_power_mw: 0.001,
    })
    const result = traceOpticalScene(scene, configuration)

    expect(
      result.events.some(
        (event) =>
          event.kind === 'termination' &&
          event.reason === 'below-minimum-power',
      ),
    ).toBe(true)
  })
})

describe('Beam Splitter branching', () => {
  const beamSplitter = component(
    'component:test-beam-splitter',
    'beam-splitter',
    { transmission_ratio: 0.6, reflection_ratio: 0.3 },
  )

  it('creates deterministic transmitted then reflected children and loss', () => {
    const execute = () => {
      const input = incoming()
      return runInteraction(beamSplitter, input.ray, input.generator)
    }
    const first = execute()
    const second = execute()

    expect(first.outgoingRays.map((ray) => ray.rayId)).toEqual([
      'ray:000002',
      'ray:000003',
    ])
    expect(first.outgoingRays.map((ray) => ray.parentRayId)).toEqual([
      'ray:000001',
      'ray:000001',
    ])
    expect(first.outgoingRays.map((ray) => ray.generation)).toEqual([1, 1])
    expect(first.outgoingRays.map((ray) => ray.power_mw)).toEqual([6, 3])
    expect(first.outgoingRays[0]?.geometry.direction).toEqual({ x: 1, y: 0 })
    expect(first.outgoingRays[1]?.geometry.direction.x).toBeCloseTo(-1, 12)
    expect(first.metadata).toMatchObject({
      branchOrder: ['transmitted', 'reflected'],
    })
    expect(first.power.lost_power_mw).toBe(1)
    expect(first).toEqual(second)
  })

  it('processes transmitted then reflected branches through the common FIFO tracer', () => {
    const laser = DEFAULT_RAMAN_SCENE.components.find(
      (item) => item.type === 'laser',
    )!
    const detectorParameters = {
      optical_throughput: 1,
      acceptance_half_angle_deg: 90,
    }
    const transmittedDetector = OpticalComponentSchema.parse({
      ...component(
        'component:detector-transmitted',
        'spectrometer',
        detectorParameters,
      ),
      transform: { x_mm: 20, y_mm: 0, rotation_deg: 90 },
    })
    const reflectedDetector = OpticalComponentSchema.parse({
      ...component(
        'component:detector-reflected',
        'spectrometer',
        detectorParameters,
      ),
      transform: { x_mm: -10, y_mm: 0, rotation_deg: 90 },
    })
    const scene = OpticalSceneSchema.parse({
      breadboards: [],
      components: [
        transmittedDetector,
        reflectedDetector,
        beamSplitter,
        {
          ...laser,
          transform: { x_mm: 0, y_mm: 0, rotation_deg: 0 },
        },
      ],
    })
    const result = traceOpticalScene(scene, DEFAULT_SIMULATION_CONFIGURATION)

    expect(
      result.events
        .filter((event) => event.kind === 'component-interaction')
        .map((event) => event.componentId),
    ).toEqual([
      'component:test-beam-splitter',
      'component:detector-transmitted',
      'component:detector-reflected',
    ])
  })
})

describe('simplified Prism deflection', () => {
  it('uses component orientation to choose a deterministic signed deflection', () => {
    const positive = component('component:prism-positive', 'prism', {
      deflection_angle_deg: 40,
    })
    const negative = component(
      'component:prism-negative',
      'prism',
      { deflection_angle_deg: 40 },
      -90,
    )
    const firstInput = incoming()
    const first = runInteraction(
      positive,
      firstInput.ray,
      firstInput.generator,
    )
    const secondInput = incoming()
    const second = runInteraction(
      negative,
      secondInput.ray,
      secondInput.generator,
    )

    expect(first.metadata).toMatchObject({ signedDeflection_deg: 40 })
    expect(first.outgoingRays[0]?.geometry.direction.y).toBeGreaterThan(0)
    expect(second.metadata).toMatchObject({ signedDeflection_deg: -40 })
    expect(second.outgoingRays[0]?.geometry.direction.y).toBeLessThan(0)
    expect(first.power.lost_power_mw).toBe(0)
  })
})

describe('Pinhole aperture behavior', () => {
  const pinhole = component(
    'component:test-pinhole',
    'pinhole',
    { model: 'geometric-aperture' },
    90,
    10,
  )

  it.each([
    { y_mm: 0, expected: 'aperture-pass' },
    { y_mm: 5, expected: 'aperture-pass' },
    { y_mm: 5.001, expected: 'aperture-blocked' },
  ])('handles full-width aperture offset $y_mm deterministically', ({ y_mm, expected }) => {
    const input = incoming(vec2(0, y_mm))
    const result = runInteraction(pinhole, input.ray, input.generator)
    expect(result.outcome).toBe(expected)
    expect(result.outgoingRays).toHaveLength(
      expected === 'aperture-pass' ? 1 : 0,
    )
    expect(result.terminationReason).toBe(
      expected === 'aperture-blocked' ? 'blocked-by-aperture' : undefined,
    )
  })
})

describe('Spectrometer acceptance', () => {
  const spectrometer = component('component:test-spectrometer', 'spectrometer', {
    optical_throughput: 0.75,
    acceptance_half_angle_deg: 10,
  })

  it.each([
    { angle_deg: 0, accepted: true },
    { angle_deg: 10, accepted: true },
    { angle_deg: 20, accepted: false },
  ])('applies inclusive normal-axis acceptance at $angle_deg°', ({ angle_deg, accepted }) => {
    const input = incoming(vec2(0, 0), rotate(vec2(1, 0), angle_deg))
    const result = runInteraction(
      spectrometer,
      input.ray,
      input.generator,
    )

    expect(result.metadata).toMatchObject({ accepted })
    expect(result.terminationReason).toBe(
      accepted ? 'detected' : 'rejected-by-acceptance',
    )
    expect(result.power.detected_power_mw).toBeCloseTo(
      accepted ? 7.5 : 0,
      12,
    )
    expect(result.power.lost_power_mw).toBeCloseTo(
      accepted ? 2.5 : 10,
      12,
    )
  })

  it('uses the surface normal as a bidirectional acceptance axis', () => {
    const input = incoming(vec2(20, 0), vec2(-1, 0))
    const result = runInteraction(
      spectrometer,
      input.ray,
      input.generator,
    )
    expect(result.metadata).toMatchObject({
      incidenceAngle_deg: 0,
      accepted: true,
    })
  })
})
