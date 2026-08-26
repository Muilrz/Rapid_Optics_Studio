import type { Vec2 } from '../model'
import {
  DEFAULT_GEOMETRY_EPSILON,
  assertValidEpsilonPolicy,
  type GeometryEpsilonPolicy,
} from './epsilon'
import { assertFiniteVec2, normalize, vec2 } from './vector'

export interface Ray2D {
  /** World-space origin in millimetres. */
  readonly origin: Vec2
  /** Normalized, dimensionless direction in the world coordinate basis. */
  readonly direction: Vec2
}

export const createRay2D = (
  origin: Vec2,
  direction: Vec2,
  epsilon: GeometryEpsilonPolicy = DEFAULT_GEOMETRY_EPSILON,
): Ray2D => {
  assertValidEpsilonPolicy(epsilon)
  assertFiniteVec2(origin, 'ray origin')
  assertFiniteVec2(direction, 'ray direction')

  const normalizedDirection = normalize(direction, epsilon.vectorLength)
  if (!normalizedDirection) {
    throw new RangeError('Ray direction must have non-zero length.')
  }

  return Object.freeze({
    origin: vec2(origin.x, origin.y),
    direction: normalizedDirection,
  })
}
