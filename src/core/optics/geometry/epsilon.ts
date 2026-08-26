export interface GeometryEpsilonPolicy {
  /** Degenerate vector threshold in vector-component scale. */
  readonly vectorLength: number
  /** Unit-vector length tolerance. */
  readonly unitVector: number
  /** Dimensionless cross-product threshold for normalized directions. */
  readonly parallel: number
  /** Minimum strictly forward ray distance in millimetres. */
  readonly positiveDistance_mm: number
  /** Inclusive aperture/circle boundary tolerance in millimetres. */
  readonly boundaryDistance_mm: number
  /** Distances within this tolerance use the stable candidate-key tie-break. */
  readonly distanceTie_mm: number
  /** Quadratic discriminant tolerance in square millimetres. */
  readonly discriminant_mm2: number
}

export const DEFAULT_GEOMETRY_EPSILON: GeometryEpsilonPolicy = Object.freeze({
  vectorLength: 1e-12,
  unitVector: 1e-10,
  parallel: 1e-12,
  positiveDistance_mm: 1e-7,
  boundaryDistance_mm: 1e-7,
  distanceTie_mm: 1e-7,
  discriminant_mm2: 1e-10,
})

export const assertValidEpsilonPolicy = (
  policy: GeometryEpsilonPolicy,
): void => {
  for (const [name, value] of Object.entries(policy)) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new RangeError(`Geometry epsilon ${name} must be finite and positive.`)
    }
  }
}
