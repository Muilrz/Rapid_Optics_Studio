import {
  RandomNumberGeneratorProvenanceSchema,
  type RandomNumberGeneratorProvenance,
} from './contracts'
import { MULBERRY32_RNG_PARAMETERS } from './modelParameters'

export interface RandomNumberGenerator {
  readonly provenance: RandomNumberGeneratorProvenance
  /** Returns one finite sample in the half-open interval [0, 1). */
  nextUnitInterval(): number
}

const validateUniformSample = (value: number): number => {
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new RangeError('Injected RNG must return finite values in [0, 1).')
  }
  return value
}

export const createMulberry32RandomNumberGenerator = (
  seed_uint32: number,
): RandomNumberGenerator => {
  const provenance = RandomNumberGeneratorProvenanceSchema.parse({
    algorithm: MULBERRY32_RNG_PARAMETERS.algorithm,
    seed_uint32,
  })
  let state = provenance.seed_uint32!

  return Object.freeze({
    provenance,
    nextUnitInterval: () => {
      state =
        (state + MULBERRY32_RNG_PARAMETERS.state_increment_uint32) >>> 0
      let mixed = state
      mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1)
      mixed ^=
        mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)
      return validateUniformSample(
        ((mixed ^ (mixed >>> 14)) >>> 0) /
          MULBERRY32_RNG_PARAMETERS.output_divisor,
      )
    },
  })
}

/** Box-Muller cosine branch matching the Sandbox normal approximation. */
export const sampleStandardNormal = (
  random: RandomNumberGenerator,
): number => {
  RandomNumberGeneratorProvenanceSchema.parse(random.provenance)
  const firstUniform = validateUniformSample(random.nextUnitInterval())
  const secondUniform = validateUniformSample(random.nextUnitInterval())
  // 1 - U is in (0, 1], avoiding log(0) without an unbounded retry loop.
  const radius = Math.sqrt(-2 * Math.log(1 - firstUniform))
  const normal = radius * Math.cos(2 * Math.PI * secondUniform)
  if (!Number.isFinite(normal)) {
    throw new RangeError('Box-Muller sampler produced a non-finite value.')
  }
  return normal
}

