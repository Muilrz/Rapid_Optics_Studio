import { describe, expect, it } from 'vitest'
import {
  DEFAULT_GEOMETRY_EPSILON,
  add,
  createRay2D,
  cross,
  dot,
  length,
  lengthSquared,
  normalize,
  reflect,
  rotate,
  scale,
  subtract,
  vec2,
} from '../../src/core/optics'

const expectVecClose = (
  actual: Readonly<{ x: number; y: number }>,
  expected: Readonly<{ x: number; y: number }>,
) => {
  expect(actual.x).toBeCloseTo(expected.x, 12)
  expect(actual.y).toBeCloseTo(expected.y, 12)
}

describe('immutable Vec2 math', () => {
  it('adds, subtracts, and scales without mutating inputs', () => {
    const left = vec2(2, 3)
    const right = vec2(-1, 5)

    expect(add(left, right)).toEqual({ x: 1, y: 8 })
    expect(subtract(left, right)).toEqual({ x: 3, y: -2 })
    expect(scale(left, 2)).toEqual({ x: 4, y: 6 })
    expect(left).toEqual({ x: 2, y: 3 })
    expect(right).toEqual({ x: -1, y: 5 })
  })

  it('calculates length and squared length', () => {
    const vector = vec2(3, 4)
    expect(lengthSquared(vector)).toBe(25)
    expect(length(vector)).toBe(5)
  })

  it('normalizes a non-zero vector', () => {
    const result = normalize(vec2(3, 4))
    expect(result).not.toBeNull()
    expectVecClose(result ?? vec2(0, 0), { x: 0.6, y: 0.8 })
    expect(length(result ?? vec2(0, 0))).toBeCloseTo(1, 12)
  })

  it('returns null for zero and epsilon-degenerate normalization', () => {
    expect(normalize(vec2(0, 0))).toBeNull()
    expect(
      normalize(vec2(DEFAULT_GEOMETRY_EPSILON.vectorLength / 2, 0)),
    ).toBeNull()
  })

  it('calculates dot and signed 2D cross products', () => {
    expect(dot(vec2(1, 2), vec2(3, 4))).toBe(11)
    expect(cross(vec2(1, 0), vec2(0, 1))).toBe(1)
    expect(cross(vec2(0, 1), vec2(1, 0))).toBe(-1)
  })

  it('rotates positive angles counter-clockwise', () => {
    expectVecClose(rotate(vec2(1, 0), 90), { x: 0, y: 1 })
    expectVecClose(rotate(vec2(1, 0), -90), { x: 0, y: -1 })
  })

  it('detects a nearly parallel normalized vector by cross magnitude', () => {
    const almostParallel = normalize(vec2(1, 1e-13))
    expect(almostParallel).not.toBeNull()
    expect(Math.abs(cross(vec2(1, 0), almostParallel ?? vec2(0, 1)))).toBeLessThan(
      DEFAULT_GEOMETRY_EPSILON.parallel,
    )
  })

  it('reflects against a normalized surface normal', () => {
    expectVecClose(reflect(vec2(1, -1), vec2(0, 1)), { x: 1, y: 1 })
    expect(() => reflect(vec2(1, -1), vec2(0, 2))).toThrow(
      /normalized surface normal/,
    )
  })

  it('rejects non-finite inputs and arithmetic overflow', () => {
    expect(() => vec2(Number.NaN, 0)).toThrow(/finite/)
    expect(() => add(vec2(1, 0), { x: Number.POSITIVE_INFINITY, y: 0 })).toThrow(
      /finite/,
    )
    expect(() => lengthSquared(vec2(Number.MAX_VALUE, 1))).toThrow(/finite range/)
  })
})

describe('geometry-only Ray2D', () => {
  it('normalizes direction and contains only origin and direction', () => {
    const ray = createRay2D(vec2(10, 20), vec2(3, 4))

    expect(Object.keys(ray)).toEqual(['origin', 'direction'])
    expect(ray.origin).toEqual({ x: 10, y: 20 })
    expectVecClose(ray.direction, { x: 0.6, y: 0.8 })
  })

  it('rejects zero-length and non-finite directions', () => {
    expect(() => createRay2D(vec2(0, 0), vec2(0, 0))).toThrow(/non-zero/)
    expect(() =>
      createRay2D(vec2(0, 0), { x: Number.POSITIVE_INFINITY, y: 0 }),
    ).toThrow(/finite/)
  })
})
