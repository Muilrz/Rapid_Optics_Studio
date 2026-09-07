import {
  CCD_NOISE_MODEL_VERSION,
  EXPECTED_CCD_SPECTRUM_MODEL_VERSION,
  ExpectedCcdSpectrumSchema,
  PREVIEW_EXPOSURE_MODEL_VERSION,
  RandomNumberGeneratorProvenanceSchema,
  SimulatedCcdPreviewExposureSchema,
  type ExpectedCcdSpectrum,
  type SimulatedCcdPreviewExposure,
} from './contracts'
import { RAMAN_SANDBOX_NOISE_PARAMETERS } from './modelParameters'
import {
  createMulberry32RandomNumberGenerator,
  sampleStandardNormal,
  type RandomNumberGenerator,
} from './rng'

const finiteValue = (value: number, label: string): number => {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be finite.`)
  }
  return value
}

/**
 * Generates one noisy CCD preview exposure. This is not an acquisition run,
 * average, history record, processed spectrum, or refresh-loop abstraction.
 */
export const simulateCcdPreviewExposure = (
  expectedSpectrum: ExpectedCcdSpectrum,
  random: RandomNumberGenerator,
): SimulatedCcdPreviewExposure => {
  const expected = ExpectedCcdSpectrumSchema.parse(expectedSpectrum)
  const rngProvenance = RandomNumberGeneratorProvenanceSchema.parse(
    random.provenance,
  )
  const countingNoise: number[] = []
  const readNoise: number[] = []
  const unclippedCounts: number[] = []
  const counts: number[] = []
  const clippedLow: boolean[] = []
  const clippedHigh: boolean[] = []
  const maximumCounts = expected.detector.full_well_counts

  for (const expectedCounts of expected.expected_counts) {
    const countingSigma = Math.sqrt(
      Math.max(
        expectedCounts,
        RAMAN_SANDBOX_NOISE_PARAMETERS.counting_variance_floor_counts,
      ),
    )
    const countingNoiseValue = finiteValue(
      countingSigma * sampleStandardNormal(random),
      'Counting-noise realization',
    )
    const readNoiseValue = finiteValue(
      expected.detector.read_noise_rms_counts * sampleStandardNormal(random),
      'Read-noise realization',
    )
    const unclipped = finiteValue(
      expectedCounts + countingNoiseValue + readNoiseValue,
      'Unclipped preview count',
    )

    countingNoise.push(countingNoiseValue)
    readNoise.push(readNoiseValue)
    unclippedCounts.push(unclipped)
    counts.push(Math.min(maximumCounts, Math.max(0, unclipped)))
    clippedLow.push(unclipped < 0)
    clippedHigh.push(unclipped > maximumCounts)
  }

  return SimulatedCcdPreviewExposureSchema.parse({
    kind: 'simulated-ccd-preview-exposure',
    model_version: PREVIEW_EXPOSURE_MODEL_VERSION,
    noise_model_version: CCD_NOISE_MODEL_VERSION,
    source_expected_spectrum_model_version:
      EXPECTED_CCD_SPECTRUM_MODEL_VERSION,
    material_id: expected.material_id,
    axis: expected.axis,
    scattered_wavelength_nm: expected.scattered_wavelength_nm,
    rng: rngProvenance,
    detector_bounds: {
      minimum_counts: 0,
      maximum_counts: maximumCounts,
    },
    counting_noise_counts: countingNoise,
    read_noise_counts: readNoise,
    unclipped_counts: unclippedCounts,
    counts,
    clipped_low: clippedLow,
    clipped_high: clippedHigh,
  })
}

export const simulateSeededCcdPreviewExposure = (
  expectedSpectrum: ExpectedCcdSpectrum,
  seed_uint32: number,
): SimulatedCcdPreviewExposure =>
  simulateCcdPreviewExposure(
    expectedSpectrum,
    createMulberry32RandomNumberGenerator(seed_uint32),
  )

