import { describe, expect, it } from 'vitest'
import {
  OpticalComponentSchema,
  componentToGeometryCandidate,
  createInitialOpticalRay,
  createSequentialRayIdGenerator,
  intersectRayWithPrimitive,
  interactWithComponent,
  vec2,
} from '../../src/core/optics'
import { DEFAULT_RAMAN_SCENE } from '../fixtures/defaultRamanScene'

const ids = () => createSequentialRayIdGenerator()
const getComponent = (type: 'mirror' | 'sample' | 'spectrometer') =>
  DEFAULT_RAMAN_SCENE.components.find((component) => component.type === type)!

const createIncoming = (
  origin: { x: number; y: number },
  direction: { x: number; y: number },
  power_mw = 10,
) => {
  const generator = ids()
  return {
    generator,
    ray: createInitialOpticalRay({
      rayId: generator.next(),
      sourceComponentId: DEFAULT_RAMAN_SCENE.components[0]!.id,
      origin: vec2(origin.x, origin.y),
      direction: vec2(direction.x, direction.y),
      wavelength_nm: 532,
      power_mw,
    }),
  }
}

describe('Phase 1C optical interactions', () => {
  it('reflects from a Mirror, applies reflectivity, and offsets the child', () => {
    const mirror = OpticalComponentSchema.parse({
      ...getComponent('mirror'),
      parameters: { reflectivity: 0.8 },
    })
    if (mirror.type !== 'mirror') throw new Error('Expected mirror fixture')
    const candidate = componentToGeometryCandidate(mirror)!
    const { ray, generator } = createIncoming({ x: 50, y: -75 }, { x: 1, y: 0 })
    const hit = intersectRayWithPrimitive(ray.geometry, candidate.primitive)!
    const result = interactWithComponent(ray, mirror, hit, {
      nextRayId: () => generator.next(),
      rayOriginOffset_mm: 0.000001,
    })
    const child = result.outgoingRays[0]!

    expect(result.outcome).toBe('ideal-reflection')
    expect(child.geometry.direction.x).toBeCloseTo(0, 12)
    expect(child.geometry.direction.y).toBeCloseTo(-1, 12)
    expect(child.power_mw).toBeCloseTo(8, 12)
    expect(child.geometry.origin.y).toBeLessThan(hit.point.y)
    expect(intersectRayWithPrimitive(child.geometry, candidate.primitive)).toBeNull()
  })

  it('absorbs at a zero-reflectivity Mirror', () => {
    const mirror = OpticalComponentSchema.parse({
      ...getComponent('mirror'),
      parameters: { reflectivity: 0 },
    })
    if (mirror.type !== 'mirror') throw new Error('Expected mirror fixture')
    const candidate = componentToGeometryCandidate(mirror)!
    const { ray, generator } = createIncoming({ x: 50, y: -75 }, { x: 1, y: 0 })
    const hit = intersectRayWithPrimitive(ray.geometry, candidate.primitive)!
    const result = interactWithComponent(ray, mirror, hit, {
      nextRayId: () => generator.next(),
      rayOriginOffset_mm: 0.000001,
    })

    expect(result.outgoingRays).toHaveLength(0)
    expect(result.terminationReason).toBe('absorbed')
  })

  it('uses an explicitly labeled elastic placeholder return at Sample', () => {
    const original = getComponent('sample')
    const sample = OpticalComponentSchema.parse({
      ...original,
      transform: { x_mm: 200, y_mm: -200, rotation_deg: 0 },
    })
    if (sample.type !== 'sample') throw new Error('Expected sample fixture')
    const candidate = componentToGeometryCandidate(sample)!
    const { ray, generator } = createIncoming({ x: 200, y: -100 }, { x: 0, y: -1 })
    const hit = intersectRayWithPrimitive(ray.geometry, candidate.primitive)!
    const result = interactWithComponent(ray, sample, hit, {
      nextRayId: () => generator.next(),
      rayOriginOffset_mm: 0.000001,
    })

    expect(result.outcome).toBe('sample-placeholder-return')
    expect(result.outgoingRays[0]?.kind).toBe('sample-return-placeholder')
    expect(result.outgoingRays[0]?.geometry.direction.x).toBeCloseTo(0, 12)
    expect(result.outgoingRays[0]?.geometry.direction.y).toBeCloseTo(1, 12)
    expect(result.outgoingRays[0]?.power_mw).toBe(ray.power_mw)
  })

  it('terminates at Spectrometer without detector physics', () => {
    const original = getComponent('spectrometer')
    const spectrometer = OpticalComponentSchema.parse({
      ...original,
      transform: { x_mm: 100, y_mm: 0, rotation_deg: 90 },
    })
    if (spectrometer.type !== 'spectrometer') {
      throw new Error('Expected spectrometer fixture')
    }
    const candidate = componentToGeometryCandidate(spectrometer)!
    const { ray, generator } = createIncoming({ x: 0, y: 0 }, { x: 1, y: 0 })
    const hit = intersectRayWithPrimitive(ray.geometry, candidate.primitive)!
    const result = interactWithComponent(ray, spectrometer, hit, {
      nextRayId: () => generator.next(),
      rayOriginOffset_mm: 0.000001,
    })

    expect(result.outcome).toBe('terminal-detection')
    expect(result.outgoingRays).toHaveLength(0)
    expect(result.terminationReason).toBe('detected')
  })
})
