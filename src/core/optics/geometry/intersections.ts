import type { Vec2 } from '../model'
import {
  DEFAULT_GEOMETRY_EPSILON,
  assertValidEpsilonPolicy,
  type GeometryEpsilonPolicy,
} from './epsilon'
import type {
  CircularTarget2D,
  FiniteOpticalSurface2D,
  GeometryPrimitive2D,
} from './primitives'
import type { Ray2D } from './ray'
import {
  add,
  cross,
  dot,
  isNormalized,
  normalize,
  perpendicularCounterClockwise,
  scale,
  subtract,
} from './vector'

interface GeometryHitBase {
  /** Hit point in world millimetres. */
  readonly point: Vec2
  /** Forward distance in mm because Ray2D.direction is normalized. */
  readonly distance_mm: number
  readonly tangent: Vec2
  readonly normal: Vec2
}

export interface FiniteSurfaceHit extends GeometryHitBase {
  readonly primitiveKind: 'finite-optical-surface'
  /** Signed displacement from surface center along its tangent. */
  readonly localOffset_mm: number
}

export interface CircularTargetHit extends GeometryHitBase {
  readonly primitiveKind: 'circular-target'
  readonly radius_mm: number
}

export type GeometryHit = FiniteSurfaceHit | CircularTargetHit

const assertNormalizedRay = (
  ray: Ray2D,
  epsilon: GeometryEpsilonPolicy,
): void => {
  if (!isNormalized(ray.direction, epsilon.unitVector)) {
    throw new RangeError('Ray2D.direction must be normalized.')
  }
}

export const intersectRayWithFiniteSurface = (
  ray: Ray2D,
  surface: FiniteOpticalSurface2D,
  epsilon: GeometryEpsilonPolicy = DEFAULT_GEOMETRY_EPSILON,
): FiniteSurfaceHit | null => {
  assertValidEpsilonPolicy(epsilon)
  assertNormalizedRay(ray, epsilon)

  const denominator = cross(ray.direction, surface.tangent)
  if (Math.abs(denominator) <= epsilon.parallel) {
    return null
  }

  const centerDelta = subtract(surface.center, ray.origin)
  const distance_mm = cross(centerDelta, surface.tangent) / denominator
  if (distance_mm <= epsilon.positiveDistance_mm) {
    return null
  }

  const localOffset_mm = cross(centerDelta, ray.direction) / denominator
  if (
    Math.abs(localOffset_mm) >
    surface.halfAperture_mm + epsilon.boundaryDistance_mm
  ) {
    return null
  }

  return Object.freeze({
    primitiveKind: 'finite-optical-surface' as const,
    point: add(ray.origin, scale(ray.direction, distance_mm)),
    distance_mm,
    tangent: surface.tangent,
    normal: surface.normal,
    localOffset_mm,
  })
}

export const intersectRayWithCircularTarget = (
  ray: Ray2D,
  target: CircularTarget2D,
  epsilon: GeometryEpsilonPolicy = DEFAULT_GEOMETRY_EPSILON,
): CircularTargetHit | null => {
  assertValidEpsilonPolicy(epsilon)
  assertNormalizedRay(ray, epsilon)

  const originDelta = subtract(ray.origin, target.center)
  const projected = dot(originDelta, ray.direction)
  const constant = dot(originDelta, originDelta) - target.radius_mm ** 2
  const discriminant = projected ** 2 - constant

  if (discriminant < -epsilon.discriminant_mm2) {
    return null
  }

  const root = Math.sqrt(Math.max(0, discriminant))
  const distances = [-projected - root, -projected + root]
    .filter((distance) => distance > epsilon.positiveDistance_mm)
    .sort((left, right) => left - right)

  const distance_mm = distances[0]
  if (distance_mm === undefined) {
    return null
  }

  const point = add(ray.origin, scale(ray.direction, distance_mm))
  const normal = normalize(subtract(point, target.center), epsilon.vectorLength)
  if (!normal) {
    throw new RangeError('Circular target hit cannot have a zero radial normal.')
  }

  return Object.freeze({
    primitiveKind: 'circular-target' as const,
    point,
    distance_mm,
    tangent: perpendicularCounterClockwise(normal),
    normal,
    radius_mm: target.radius_mm,
  })
}

export const intersectRayWithPrimitive = (
  ray: Ray2D,
  primitive: GeometryPrimitive2D,
  epsilon: GeometryEpsilonPolicy = DEFAULT_GEOMETRY_EPSILON,
): GeometryHit | null =>
  primitive.kind === 'finite-optical-surface'
    ? intersectRayWithFiniteSurface(ray, primitive, epsilon)
    : intersectRayWithCircularTarget(ray, primitive, epsilon)
