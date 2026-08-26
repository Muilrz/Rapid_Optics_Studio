import { describe, expect, it } from 'vitest'
import {
  DEFAULT_GEOMETRY_EPSILON,
  OpticalGeometrySchema,
  Transform2DSchema,
  createFiniteOpticalSurface,
  createRay2D,
  findNearestPositiveIntersection,
  vec2,
  type GeometryIntersectionCandidate,
} from '../../src/core/optics'

const surfaceAtX = (x_mm: number) =>
  createFiniteOpticalSurface(
    Transform2DSchema.parse({ x_mm, y_mm: 0, rotation_deg: 90 }),
    OpticalGeometrySchema.parse({ aperture_mm: 20 }),
  )

const ray = createRay2D(vec2(0, 0), vec2(1, 0))

describe('deterministic nearest positive intersection', () => {
  it('selects the nearest of multiple forward surfaces', () => {
    const result = findNearestPositiveIntersection(ray, [
      { key: 'surface:far', primitive: surfaceAtX(20) },
      { key: 'surface:near', primitive: surfaceAtX(10) },
    ])

    expect(result?.candidateKey).toBe('surface:near')
    expect(result?.hit.distance_mm).toBeCloseTo(10, 12)
  })

  it('ignores a behind candidate', () => {
    const result = findNearestPositiveIntersection(ray, [
      { key: 'surface:behind', primitive: surfaceAtX(-5) },
      { key: 'surface:forward', primitive: surfaceAtX(10) },
    ])
    expect(result?.candidateKey).toBe('surface:forward')
  })

  it('returns null when every candidate misses', () => {
    const parallel = createFiniteOpticalSurface(
      Transform2DSchema.parse({ x_mm: 0, y_mm: 10, rotation_deg: 0 }),
      OpticalGeometrySchema.parse({ aperture_mm: 5 }),
    )
    expect(
      findNearestPositiveIntersection(ray, [
        { key: 'surface:parallel', primitive: parallel },
        { key: 'surface:behind', primitive: surfaceAtX(-5) },
      ]),
    ).toBeNull()
  })

  it('uses stable lexical keys for near ties independent of array order', () => {
    const candidates: readonly GeometryIntersectionCandidate[] = [
      { key: 'z-nearer', primitive: surfaceAtX(10) },
      {
        key: 'a-stable-winner',
        primitive: surfaceAtX(
          10 + DEFAULT_GEOMETRY_EPSILON.distanceTie_mm / 2,
        ),
      },
    ]

    expect(findNearestPositiveIntersection(ray, candidates)?.candidateKey).toBe(
      'a-stable-winner',
    )
    expect(
      findNearestPositiveIntersection(ray, [...candidates].reverse())
        ?.candidateKey,
    ).toBe('a-stable-winner')
  })

  it('rejects duplicate candidate keys', () => {
    expect(() =>
      findNearestPositiveIntersection(ray, [
        { key: 'duplicate', primitive: surfaceAtX(10) },
        { key: 'duplicate', primitive: surfaceAtX(20) },
      ]),
    ).toThrow(/Duplicate geometry candidate key/)
  })
})
