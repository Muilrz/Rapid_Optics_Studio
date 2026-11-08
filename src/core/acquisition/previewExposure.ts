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
import { realizeCcdCounts } from './ccdRealization'
import {
  createMulberry32RandomNumberGenerator,
  type RandomNumberGenerator,
} from './rng'

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
  const { countingNoise, readNoise, unclippedCounts, counts, clippedLow, clippedHigh } = realizeCcdCounts(expected, random)
  const maximumCounts = expected.detector.full_well_counts

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

