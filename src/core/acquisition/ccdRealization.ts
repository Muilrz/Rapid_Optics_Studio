import type { ExpectedCcdSpectrum } from './contracts'
import { RAMAN_SANDBOX_NOISE_PARAMETERS } from './modelParameters'
import { sampleStandardNormal, type RandomNumberGenerator } from './rng'

const finiteValue = (value: number, label: string): number => {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite.`)
  return value
}

/** Shared realization, preserving Phase 3 draw order and arithmetic exactly. */
export const realizeCcdCounts = (expected: ExpectedCcdSpectrum, random: RandomNumberGenerator) => {
  const countingNoise: number[] = []
  const readNoise: number[] = []
  const unclippedCounts: number[] = []
  const counts: number[] = []
  const clippedLow: boolean[] = []
  const clippedHigh: boolean[] = []
  const maximumCounts = expected.detector.full_well_counts
  for (const expectedCounts of expected.expected_counts) {
    const countingSigma = Math.sqrt(Math.max(expectedCounts,
      RAMAN_SANDBOX_NOISE_PARAMETERS.counting_variance_floor_counts))
    const countingNoiseValue = finiteValue(countingSigma * sampleStandardNormal(random), 'Counting-noise realization')
    const readNoiseValue = finiteValue(expected.detector.read_noise_rms_counts * sampleStandardNormal(random), 'Read-noise realization')
    const unclipped = finiteValue(expectedCounts + countingNoiseValue + readNoiseValue, 'Unclipped preview count')
    countingNoise.push(countingNoiseValue)
    readNoise.push(readNoiseValue)
    unclippedCounts.push(unclipped)
    counts.push(Math.min(maximumCounts, Math.max(0, unclipped)))
    clippedLow.push(unclipped < 0)
    clippedHigh.push(unclipped > maximumCounts)
  }
  return { countingNoise, readNoise, unclippedCounts, counts, clippedLow, clippedHigh }
}
