import { describe, expect, it } from 'vitest'
import {
  DEFAULT_GEOMETRY_EPSILON,
  OpticalGeometrySchema,
  Transform2DSchema,
  createCircularTarget,
  createFiniteOpticalSurface,
  createRay2D,
  intersectRayWithCircularTarget,
  intersectRayWithFiniteSurface,
  vec2,
} from '../../src/core/optics'

const transform = (x_mm: number, y_mm: number, rotation_deg: number) =>
  Transform2DSchema.parse({ x_mm, y_mm, rotation_deg })

const geometry = (aperture_mm: number) =>
  OpticalGeometrySchema.parse({ aperture_mm })

const verticalSurface = (x_mm: number, aperture_mm = 10) =>
  createFiniteOpticalSurface(transform(x_mm, 0, 90), geometry(aperture_mm))

describe('Ray2D ↔ finite optical surface', () => {
  it('returns a central forward hit with geometry information', () => {
    const hit = intersectRayWithFiniteSurface(
      createRay2D(vec2(0, 0), vec2(1, 0)),
      verticalSurface(10),
    )

    expect(hit?.distance_mm).toBeCloseTo(10, 12)
    expect(hit?.point.x).toBeCloseTo(10, 12)
    expect(hit?.point.y).toBeCloseTo(0, 12)
    expect(hit?.localOffset_mm).toBeCloseTo(0, 12)
    expect(hit?.normal.x).toBeCloseTo(-1, 12)
    expect(hit?.normal.y).toBeCloseTo(0, 12)
  })

  it('includes exact aperture endpoints', () => {
    const hit = intersectRayWithFiniteSurface(
      createRay2D(vec2(0, 5), vec2(1, 0)),
      verticalSurface(10, 10),
    )

    expect(hit).not.toBeNull()
    expect(Math.abs(hit?.localOffset_mm ?? 0)).toBeCloseTo(5, 12)
  })

  it('rejects an aperture miss', () => {
    const hit = intersectRayWithFiniteSurface(
      createRay2D(vec2(0, 5.001), vec2(1, 0)),
      verticalSurface(10, 10),
    )
    expect(hit).toBeNull()
  })

  it('rejects parallel and nearly parallel rays', () => {
    const surface = verticalSurface(10)
    expect(
      intersectRayWithFiniteSurface(
        createRay2D(vec2(0, 0), vec2(0, 1)),
        surface,
      ),
    ).toBeNull()
    expect(
      intersectRayWithFiniteSurface(
        createRay2D(vec2(0, 0), vec2(1e-13, 1)),
        surface,
      ),
    ).toBeNull()
  })

  it('rejects a hit behind the ray origin', () => {
    expect(
      intersectRayWithFiniteSurface(
        createRay2D(vec2(0, 0), vec2(1, 0)),
        verticalSurface(-10),
      ),
    ).toBeNull()
  })

  it('rejects self-hits and extremely near hits using the shared epsilon', () => {
    const ray = createRay2D(vec2(0, 0), vec2(1, 0))
    expect(intersectRayWithFiniteSurface(ray, verticalSurface(0))).toBeNull()
    expect(
      intersectRayWithFiniteSurface(
        ray,
        verticalSurface(DEFAULT_GEOMETRY_EPSILON.positiveDistance_mm / 2),
      ),
    ).toBeNull()
    expect(
      intersectRayWithFiniteSurface(
        ray,
        verticalSurface(DEFAULT_GEOMETRY_EPSILON.positiveDistance_mm * 2),
      ),
    ).not.toBeNull()
  })
})

describe('Ray2D ↔ circular target', () => {
  it('selects the nearest positive root for a normal hit', () => {
    const target = createCircularTarget(transform(10, 0, 0), geometry(4))
    const hit = intersectRayWithCircularTarget(
      createRay2D(vec2(0, 0), vec2(1, 0)),
      target,
    )

    expect(hit?.distance_mm).toBeCloseTo(8, 12)
    expect(hit?.point).toEqual({ x: 8, y: 0 })
    expect(hit?.normal).toEqual({ x: -1, y: 0 })
  })

  it('accepts a tangent hit', () => {
    const target = createCircularTarget(transform(10, 2, 0), geometry(4))
    const hit = intersectRayWithCircularTarget(
      createRay2D(vec2(0, 0), vec2(1, 0)),
      target,
    )

    expect(hit?.distance_mm).toBeCloseTo(10, 12)
    expect(hit?.point.x).toBeCloseTo(10, 12)
    expect(hit?.point.y).toBeCloseTo(0, 12)
  })

  it('returns null for a miss', () => {
    const target = createCircularTarget(transform(10, 3, 0), geometry(4))
    expect(
      intersectRayWithCircularTarget(
        createRay2D(vec2(0, 0), vec2(1, 0)),
        target,
      ),
    ).toBeNull()
  })

  it('returns the forward exit when the origin is inside', () => {
    const target = createCircularTarget(transform(0, 0, 0), geometry(4))
    const hit = intersectRayWithCircularTarget(
      createRay2D(vec2(0, 0), vec2(1, 0)),
      target,
    )

    expect(hit?.distance_mm).toBeCloseTo(2, 12)
    expect(hit?.point).toEqual({ x: 2, y: 0 })
    expect(hit?.normal).toEqual({ x: 1, y: 0 })
  })

  it('ignores roots behind the ray origin', () => {
    const target = createCircularTarget(transform(-10, 0, 0), geometry(4))
    expect(
      intersectRayWithCircularTarget(
        createRay2D(vec2(0, 0), vec2(1, 0)),
        target,
      ),
    ).toBeNull()
  })
})
