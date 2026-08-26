import {
  DEFAULT_GEOMETRY_EPSILON,
  assertValidEpsilonPolicy,
  type GeometryEpsilonPolicy,
} from './epsilon'
import {
  intersectRayWithPrimitive,
  type GeometryHit,
} from './intersections'
import type { GeometryPrimitive2D } from './primitives'
import type { Ray2D } from './ray'

export interface GeometryIntersectionCandidate {
  /** Stable geometry-level key used for deterministic near-tie resolution. */
  readonly key: string
  readonly primitive: GeometryPrimitive2D
}

export interface NearestGeometryIntersection {
  readonly candidateKey: string
  readonly primitive: GeometryPrimitive2D
  readonly hit: GeometryHit
}

const compareKeys = (left: string, right: string): number => {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

export const findNearestPositiveIntersection = (
  ray: Ray2D,
  candidates: readonly GeometryIntersectionCandidate[],
  epsilon: GeometryEpsilonPolicy = DEFAULT_GEOMETRY_EPSILON,
): NearestGeometryIntersection | null => {
  assertValidEpsilonPolicy(epsilon)

  const keys = new Set<string>()
  let nearest: NearestGeometryIntersection | null = null

  for (const candidate of candidates) {
    if (!candidate.key) {
      throw new RangeError('Geometry candidate key must not be empty.')
    }
    if (keys.has(candidate.key)) {
      throw new RangeError(`Duplicate geometry candidate key: ${candidate.key}`)
    }
    keys.add(candidate.key)

    const hit = intersectRayWithPrimitive(ray, candidate.primitive, epsilon)
    if (!hit || hit.distance_mm <= epsilon.positiveDistance_mm) {
      continue
    }

    if (!nearest) {
      nearest = Object.freeze({
        candidateKey: candidate.key,
        primitive: candidate.primitive,
        hit,
      })
      continue
    }

    const distanceDifference = hit.distance_mm - nearest.hit.distance_mm
    const isCloser = distanceDifference < -epsilon.distanceTie_mm
    const isTie = Math.abs(distanceDifference) <= epsilon.distanceTie_mm

    if (
      isCloser ||
      (isTie && compareKeys(candidate.key, nearest.candidateKey) < 0)
    ) {
      nearest = Object.freeze({
        candidateKey: candidate.key,
        primitive: candidate.primitive,
        hit,
      })
    }
  }

  return nearest
}
