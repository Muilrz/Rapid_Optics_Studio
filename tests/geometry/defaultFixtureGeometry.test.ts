import { describe, expect, it } from 'vitest'
import {
  createCircularTarget,
  createFiniteOpticalSurface,
  createRay2D,
  intersectRayWithCircularTarget,
  intersectRayWithFiniteSurface,
  rotate,
  vec2,
} from '../../src/core/optics'
import { DEFAULT_RAMAN_SCENE } from '../fixtures/defaultRamanScene'

const component = (type: (typeof DEFAULT_RAMAN_SCENE.components)[number]['type']) => {
  const result = DEFAULT_RAMAN_SCENE.components.find((item) => item.type === type)
  if (!result) throw new Error(`Default fixture is missing ${type}.`)
  return result
}

describe('mm-based default Raman fixture geometry', () => {
  it('explicitly converts Demo screen coordinates into +Y-up world coordinates', () => {
    const laser = component('laser')
    const mirror = component('mirror')
    const dichroic = component('dichroic')

    expect(laser.transform).toMatchObject({
      x_mm: 50,
      y_mm: -75,
      rotation_deg: 0,
    })
    expect(mirror.transform).toMatchObject({
      x_mm: 200,
      y_mm: -75,
      rotation_deg: -45,
    })
    expect(dichroic.transform).toMatchObject({
      x_mm: 200,
      y_mm: -200,
      rotation_deg: -45,
    })
  })

  it('supports geometry-level Laser-to-Mirror and Mirror-to-Dichroic hits', () => {
    const laser = component('laser')
    const mirror = component('mirror')
    const dichroic = component('dichroic')
    const mirrorSurface = createFiniteOpticalSurface(
      mirror.transform,
      mirror.geometry,
    )
    const dichroicSurface = createFiniteOpticalSurface(
      dichroic.transform,
      dichroic.geometry,
    )

    const laserDirection = rotate(vec2(1, 0), laser.transform.rotation_deg)
    const laserRay = createRay2D(
      vec2(laser.transform.x_mm, laser.transform.y_mm),
      laserDirection,
    )
    const mirrorHit = intersectRayWithFiniteSurface(laserRay, mirrorSurface)

    expect(mirrorHit?.distance_mm).toBeCloseTo(150, 9)
    expect(mirrorHit?.localOffset_mm).toBeCloseTo(0, 9)

    const downwardRay = createRay2D(
      vec2(mirror.transform.x_mm, mirror.transform.y_mm),
      vec2(0, -1),
    )
    const dichroicHit = intersectRayWithFiniteSurface(
      downwardRay,
      dichroicSurface,
    )

    expect(dichroicHit?.distance_mm).toBeCloseTo(125, 9)
    expect(dichroicHit?.localOffset_mm).toBeCloseTo(0, 9)
  })

  it('supports the Objective-to-Sample geometry without propagation logic', () => {
    const objective = component('objective')
    const sample = component('sample')
    const target = createCircularTarget(sample.transform, sample.geometry)
    const ray = createRay2D(
      vec2(objective.transform.x_mm, objective.transform.y_mm),
      vec2(1, 0),
    )
    const hit = intersectRayWithCircularTarget(ray, target)

    expect(objective.parameters).toMatchObject({ focal_length_mm: 75 })
    expect(hit?.distance_mm).toBeCloseTo(70, 9)
    expect(hit?.point).toEqual({ x: 395, y: -200 })
  })
})
