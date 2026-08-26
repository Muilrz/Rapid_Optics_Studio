import { describe, expect, it } from 'vitest'
import {
  OpticalGeometrySchema,
  Transform2DSchema,
  createAperturePlane,
  createRay2D,
  intersectRayWithAperturePlane,
  vec2,
} from '../../src/core/optics'

const plane = createAperturePlane(
  Transform2DSchema.parse({ x_mm: 10, y_mm: 0, rotation_deg: 90 }),
  OpticalGeometrySchema.parse({ aperture_mm: 10 }),
)

describe('generic aperture plane geometry', () => {
  it('reports centered and full-width boundary crossings inside the opening', () => {
    const center = intersectRayWithAperturePlane(
      createRay2D(vec2(0, 0), vec2(1, 0)),
      plane,
    )
    const edge = intersectRayWithAperturePlane(
      createRay2D(vec2(0, 5), vec2(1, 0)),
      plane,
    )

    expect(center?.insideAperture).toBe(true)
    expect(center?.localOffset_mm).toBeCloseTo(0, 12)
    expect(edge?.insideAperture).toBe(true)
    expect(Math.abs(edge?.localOffset_mm ?? 0)).toBeCloseTo(5, 12)
  })

  it('still reports an outside crossing so an interaction can block it', () => {
    const hit = intersectRayWithAperturePlane(
      createRay2D(vec2(0, 5.001), vec2(1, 0)),
      plane,
    )
    expect(hit?.insideAperture).toBe(false)
  })

  it('returns no crossing for parallel or behind-origin planes', () => {
    expect(
      intersectRayWithAperturePlane(
        createRay2D(vec2(0, 0), vec2(0, 1)),
        plane,
      ),
    ).toBeNull()
    expect(
      intersectRayWithAperturePlane(
        createRay2D(vec2(20, 0), vec2(1, 0)),
        plane,
      ),
    ).toBeNull()
  })
})
