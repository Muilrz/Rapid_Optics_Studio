import { describe, expect, it } from 'vitest'
import {
  OpticalComponentSchema,
  createSequentialRayIdGenerator,
  emitLaserRay,
} from '../../src/core/optics'
import { DEFAULT_RAMAN_SCENE } from '../fixtures/defaultRamanScene'

const defaultLaser = DEFAULT_RAMAN_SCENE.components.find(
  (component) => component.type === 'laser',
)!

describe('Laser source emission', () => {
  it('uses the world-space positive rotation convention', () => {
    const laser = OpticalComponentSchema.parse({
      ...defaultLaser,
      transform: { ...defaultLaser.transform, rotation_deg: 90 },
    })
    if (laser.type !== 'laser') throw new Error('Expected laser fixture')

    const ray = emitLaserRay(laser, createSequentialRayIdGenerator())!
    expect(ray.geometry.origin).toEqual({
      x: laser.transform.x_mm,
      y: laser.transform.y_mm,
    })
    expect(ray.geometry.direction.x).toBeCloseTo(0, 12)
    expect(ray.geometry.direction.y).toBeCloseTo(1, 12)
    expect(ray.wavelength_nm).toBe(laser.parameters.wavelength_nm)
    expect(ray.power_mw).toBe(laser.parameters.power_mw)
  })

  it('does not emit from a disabled Laser', () => {
    const laser = OpticalComponentSchema.parse({
      ...defaultLaser,
      enabled: false,
    })
    if (laser.type !== 'laser') throw new Error('Expected laser fixture')

    expect(
      emitLaserRay(laser, createSequentialRayIdGenerator()),
    ).toBeNull()
  })
})
