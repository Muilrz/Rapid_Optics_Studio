import { describe, expect, it } from 'vitest'
import {
  GEOMETRY_CONVENTION,
  OpticalGeometrySchema,
  Transform2DSchema,
  createCircularTarget,
  createFiniteOpticalSurface,
} from '../../src/core/optics'

const transform = (x_mm: number, y_mm: number, rotation_deg: number) =>
  Transform2DSchema.parse({ x_mm, y_mm, rotation_deg })

const geometry = (aperture_mm: number) =>
  OpticalGeometrySchema.parse({ aperture_mm })

describe('world and planar-surface conventions', () => {
  it('records the formal world convention', () => {
    expect(GEOMETRY_CONVENTION).toMatchObject({
      positiveX: 'right',
      positiveY: 'up',
      positiveRotation: 'counter-clockwise',
      planarSurfaceRotationZero: 'tangent-along-positive-x',
      finiteApertureMeaning: 'full-width',
      circularApertureMeaning: 'full-diameter',
    })
  })

  it('maps rotation_deg=0 to +X tangent and +Y normal', () => {
    const surface = createFiniteOpticalSurface(transform(4, 5, 0), geometry(20))

    expect(surface.center).toEqual({ x: 4, y: 5 })
    expect(surface.tangent.x).toBeCloseTo(1, 12)
    expect(surface.tangent.y).toBeCloseTo(0, 12)
    expect(surface.normal.x).toBeCloseTo(0, 12)
    expect(surface.normal.y).toBeCloseTo(1, 12)
  })

  it('uses counter-clockwise positive rotation for tangent and normal', () => {
    const surface = createFiniteOpticalSurface(transform(0, 0, 90), geometry(20))

    expect(surface.tangent.x).toBeCloseTo(0, 12)
    expect(surface.tangent.y).toBeCloseTo(1, 12)
    expect(surface.normal.x).toBeCloseTo(-1, 12)
    expect(surface.normal.y).toBeCloseTo(0, 12)
  })

  it('treats planar aperture as full width', () => {
    const surface = createFiniteOpticalSurface(transform(0, 0, 0), geometry(20))
    expect(surface.aperture_mm).toBe(20)
    expect(surface.halfAperture_mm).toBe(10)
  })

  it('treats circular aperture as full diameter', () => {
    const target = createCircularTarget(transform(0, 0, 0), geometry(20))
    expect(target.aperture_mm).toBe(20)
    expect(target.radius_mm).toBe(10)
  })
})
