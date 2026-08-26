import { describe, expect, it } from 'vitest'
import {
  createChildOpticalRay,
  createInitialOpticalRay,
  createSequentialRayIdGenerator,
  length,
  vec2,
} from '../../src/core/optics'
import { DEFAULT_RAMAN_SCENE } from '../fixtures/defaultRamanScene'

const laser = DEFAULT_RAMAN_SCENE.components.find(
  (component) => component.type === 'laser',
)!

describe('OpticalRay runtime model', () => {
  it('creates a valid initial ray with a normalized geometry direction', () => {
    const ids = createSequentialRayIdGenerator()
    const ray = createInitialOpticalRay({
      rayId: ids.next(),
      sourceComponentId: laser.id,
      origin: vec2(1, 2),
      direction: vec2(3, 4),
      wavelength_nm: 532,
      power_mw: 10,
    })

    expect(ray.parentRayId).toBeNull()
    expect(ray.generation).toBe(0)
    expect(ray.kind).toBe('excitation')
    expect(length(ray.geometry.direction)).toBeCloseTo(1, 12)
    expect(ray.geometry.direction).toEqual({ x: 0.6, y: 0.8 })
  })

  it('preserves source identity and establishes child lineage', () => {
    const ids = createSequentialRayIdGenerator()
    const parent = createInitialOpticalRay({
      rayId: ids.next(),
      sourceComponentId: laser.id,
      origin: vec2(0, 0),
      direction: vec2(1, 0),
      wavelength_nm: 532,
      power_mw: 10,
    })
    const child = createChildOpticalRay(parent, {
      rayId: ids.next(),
      origin: vec2(10, 0),
      direction: vec2(0, 2),
      power_mw: 8,
    })

    expect(child.parentRayId).toBe(parent.rayId)
    expect(child.generation).toBe(1)
    expect(child.sourceComponentId).toBe(parent.sourceComponentId)
    expect(child.wavelength_nm).toBe(parent.wavelength_nm)
    expect(child.geometry.direction).toEqual({ x: 0, y: 1 })
  })

  it('generates deterministic unique IDs per trace-local generator', () => {
    const first = createSequentialRayIdGenerator()
    const second = createSequentialRayIdGenerator()

    expect([first.next(), first.next(), first.next()]).toEqual([
      'ray:000001',
      'ray:000002',
      'ray:000003',
    ])
    expect(second.next()).toBe('ray:000001')
  })

  it('rejects invalid runtime wavelength, power, and direction', () => {
    const build = (
      wavelength_nm: number,
      power_mw: number,
      direction = vec2(1, 0),
    ) =>
      createInitialOpticalRay({
        rayId: createSequentialRayIdGenerator().next(),
        sourceComponentId: laser.id,
        origin: vec2(0, 0),
        direction,
        wavelength_nm,
        power_mw,
      })

    expect(() => build(Number.NaN, 1)).toThrow()
    expect(() => build(532, -1)).toThrow()
    expect(() => build(532, 1, vec2(0, 0))).toThrow()
  })
})
