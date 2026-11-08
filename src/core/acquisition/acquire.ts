import {
  ACQUISITION_CONTRACT_VERSION, ACQUISITION_RNG_ORDER_VERSION,
  AcquisitionExposureSchema, AcquisitionInputSchema, AcquisitionRngProvenanceSchema,
  AcquisitionRuntimeSchema, CompletedAcquisitionRunSchema, RawAcquiredSpectrumSchema,
  type AcquisitionExposure, type AcquisitionInput,
} from './acquisitionContracts'
import { CCD_NOISE_MODEL_VERSION } from './contracts'
import { realizeCcdCounts } from './ccdRealization'
import { createMulberry32RandomNumberGenerator, type RandomNumberGenerator } from './rng'
import { calculatePeakSnr, calculateRayleighOd } from './numericalMetrics'

export const createAcquisitionRngProvenance = (seed: number) => AcquisitionRngProvenanceSchema.parse({
  algorithm: 'mulberry32', algorithm_version: 'mulberry32-v1', seed_uint32: seed,
  sampling_algorithm: 'box-muller-cosine', sampling_algorithm_version: 'box-muller-cosine-two-uniforms-v1',
  consumption_order_version: ACQUISITION_RNG_ORDER_VERSION, noise_model_version: CCD_NOISE_MODEL_VERSION,
})

export const createAcquisitionRandom = (input: AcquisitionInput) =>
  createMulberry32RandomNumberGenerator(input.rng.seed_uint32)

export const simulateAcquisitionExposure = (input: AcquisitionInput, index: number, random: RandomNumberGenerator): AcquisitionExposure => {
  if (!Number.isSafeInteger(index) || index < 0 || index >= input.request.number_of_exposures) throw new RangeError('Exposure index must be in [0, N).')
  if (random.provenance.algorithm !== input.rng.algorithm_version || random.provenance.seed_uint32 !== input.rng.seed_uint32) {
    throw new RangeError('Acquisition RNG must match Run provenance.')
  }
  const realization = realizeCcdCounts(input.expected_spectrum, random)
  return AcquisitionExposureSchema.parse({
    kind: 'acquisition-exposure', contract_version: ACQUISITION_CONTRACT_VERSION,
    run_id: input.id, exposure_index: index, axis: input.expected_spectrum.axis,
    unit: 'counts/bin', counts: realization.counts,
    detector_bounds: { minimum_counts: 0, maximum_counts: input.instrument_snapshot.detector.full_well_counts },
    rng: input.rng, clipped_low: realization.clippedLow, clipped_high: realization.clippedHigh,
  })
}

/** Stable mean avoids overflowing the sum even near the finite detector ceiling. */
export const averageAcquisitionExposures = (input: AcquisitionInput, exposures: readonly AcquisitionExposure[]) => {
  const checked = AcquisitionRuntimeSchema.parse({ status: 'running', token: 'aggregation', input, exposures })
  if (checked.status !== 'running' || exposures.length !== input.request.number_of_exposures) {
    throw new RangeError('Raw mean requires exactly N accepted exposures.')
  }
  const mean = [...checked.exposures[0]!.counts]
  for (let i = 1; i < checked.exposures.length; i += 1) {
    checked.exposures[i]!.counts.forEach((value, j) => { mean[j] += (value - mean[j]!) / (i + 1) })
  }
  return RawAcquiredSpectrumSchema.parse({
    kind: 'raw-acquired-spectrum', contract_version: ACQUISITION_CONTRACT_VERSION,
    run_id: input.id, axis: input.expected_spectrum.axis, unit: 'counts/bin', counts: mean,
    detector_bounds: checked.exposures[0]!.detector_bounds,
    aggregation: 'arithmetic-mean', number_of_exposures: exposures.length,
  })
}

export const completeAcquisition = (inputData: AcquisitionInput, exposures: readonly AcquisitionExposure[], completedAt: string) => {
  const input = AcquisitionInputSchema.parse(inputData)
  const context = input.instrument_snapshot.context
  const raw = averageAcquisitionExposures(input, exposures)
  const proxy = (value: number, source: string) => ({ status: 'available', value, unit: 'mW', source,
    model_version: context.model_version,
    scientific_semantics: 'detected-effective-power-proxy-not-absolute-raman-radiant-power' })
  return CompletedAcquisitionRunSchema.parse({
    status: 'completed', input, exposures, completed_at: completedAt,
    acquired_spectrum: raw,
    metrics: {
      focus_efficiency: context.focus.efficiency,
      raman_power: proxy(context.raman_return.detected_effective_excitation_power_mw, 'raman_return.detected_effective_excitation_power_mw'),
      rayleigh_leakage: proxy(context.rayleigh_return.detected_effective_leakage_power_mw, 'rayleigh_return.detected_effective_leakage_power_mw'),
      snr: calculatePeakSnr(input, exposures, raw),
      rayleigh_od: calculateRayleighOd(input),
      saturation: { evidence: 'expected-mask-and-per-exposure-clipping', expected_saturated_bin_count: input.expected_spectrum.saturated_bin_count },
    },
  })
}
