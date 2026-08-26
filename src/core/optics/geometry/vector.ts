import type { Vec2 } from '../model'
import { DEFAULT_GEOMETRY_EPSILON } from './epsilon'

export const assertFiniteVec2 = (value: Vec2, name = 'vector'): void => {
  if (!Number.isFinite(value.x) || !Number.isFinite(value.y)) {
    throw new RangeError(`${name} components must be finite.`)
  }
}

export const vec2 = (x: number, y: number): Vec2 => {
  const value = { x, y }
  assertFiniteVec2(value)
  return Object.freeze(value)
}

export const add = (left: Vec2, right: Vec2): Vec2 => {
  assertFiniteVec2(left, 'left vector')
  assertFiniteVec2(right, 'right vector')
  return vec2(left.x + right.x, left.y + right.y)
}

export const subtract = (left: Vec2, right: Vec2): Vec2 => {
  assertFiniteVec2(left, 'left vector')
  assertFiniteVec2(right, 'right vector')
  return vec2(left.x - right.x, left.y - right.y)
}

export const scale = (vector: Vec2, scalar: number): Vec2 => {
  assertFiniteVec2(vector)
  if (!Number.isFinite(scalar)) {
    throw new RangeError('Vector scale must be finite.')
  }
  return vec2(vector.x * scalar, vector.y * scalar)
}

export const lengthSquared = (vector: Vec2): number => {
  assertFiniteVec2(vector)
  const result = vector.x * vector.x + vector.y * vector.y
  if (!Number.isFinite(result)) {
    throw new RangeError('Squared vector length is outside the finite range.')
  }
  return result
}

export const length = (vector: Vec2): number => {
  assertFiniteVec2(vector)
  const result = Math.hypot(vector.x, vector.y)
  if (!Number.isFinite(result)) {
    throw new RangeError('Vector length is outside the finite range.')
  }
  return result
}

export const dot = (left: Vec2, right: Vec2): number => {
  assertFiniteVec2(left, 'left vector')
  assertFiniteVec2(right, 'right vector')
  const result = left.x * right.x + left.y * right.y
  if (!Number.isFinite(result)) {
    throw new RangeError('Dot product is outside the finite range.')
  }
  return result
}

export const cross = (left: Vec2, right: Vec2): number => {
  assertFiniteVec2(left, 'left vector')
  assertFiniteVec2(right, 'right vector')
  const result = left.x * right.y - left.y * right.x
  if (!Number.isFinite(result)) {
    throw new RangeError('Cross product is outside the finite range.')
  }
  return result
}

export const normalize = (
  vector: Vec2,
  zeroThreshold = DEFAULT_GEOMETRY_EPSILON.vectorLength,
): Vec2 | null => {
  if (!Number.isFinite(zeroThreshold) || zeroThreshold <= 0) {
    throw new RangeError('Normalization threshold must be finite and positive.')
  }

  const magnitude = length(vector)
  if (magnitude <= zeroThreshold) {
    return null
  }
  return vec2(vector.x / magnitude, vector.y / magnitude)
}

export const isNormalized = (
  vector: Vec2,
  tolerance = DEFAULT_GEOMETRY_EPSILON.unitVector,
): boolean => {
  if (!Number.isFinite(tolerance) || tolerance <= 0) {
    throw new RangeError('Unit-vector tolerance must be finite and positive.')
  }
  return Math.abs(length(vector) - 1) <= tolerance
}

export const rotate = (vector: Vec2, angle_deg: number): Vec2 => {
  assertFiniteVec2(vector)
  if (!Number.isFinite(angle_deg)) {
    throw new RangeError('Rotation angle must be finite.')
  }

  const angle_rad = (angle_deg * Math.PI) / 180
  const cosine = Math.cos(angle_rad)
  const sine = Math.sin(angle_rad)
  return vec2(
    vector.x * cosine - vector.y * sine,
    vector.x * sine + vector.y * cosine,
  )
}

export const perpendicularCounterClockwise = (vector: Vec2): Vec2 => {
  assertFiniteVec2(vector)
  return vec2(-vector.y, vector.x)
}

export const reflect = (vector: Vec2, normalizedNormal: Vec2): Vec2 => {
  assertFiniteVec2(vector)
  assertFiniteVec2(normalizedNormal, 'surface normal')
  if (!isNormalized(normalizedNormal)) {
    throw new RangeError('Reflection requires a normalized surface normal.')
  }

  return subtract(vector, scale(normalizedNormal, 2 * dot(vector, normalizedNormal)))
}
