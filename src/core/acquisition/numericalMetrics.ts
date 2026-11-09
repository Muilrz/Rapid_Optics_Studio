import type { AcquisitionExposure, AcquisitionInput, RawAcquiredSpectrum } from './acquisitionContracts'
import type { RamanOpticalContext } from '../raman'
import { RAMAN_SANDBOX_NOISE_PARAMETERS } from './modelParameters'
import { calculateExpectedCcdSpectrum, synthesizeRamanSpectrumAtSpectrometerInput } from './virtualSpectrometer'

export const PEAK_SNR_MODEL_VERSION = 'model-peak-bin-snr-v1' as const
export const RAYLEIGH_OD_MODEL_VERSION = 'rayleigh-path-od-v1' as const
export const PEAK_SNR_SEMANTICS = 'predicted-raman-peak-bin-snr-of-N-mean-before-clipping' as const
export const RAYLEIGH_OD_SEMANTICS = 'sample-return-to-spectrometer-input-at-excitation-wavelength' as const

export interface UndefinedNumericalMetric {
  readonly status: 'undefined'
  readonly value: null
  readonly undefined_reason: string
}
interface AvailableMetric {
  readonly status: 'available'
  readonly value: number
  readonly source: string
  readonly model_version: string
  readonly scientific_semantics: string
}
export interface AvailablePeakSnr extends AvailableMetric {
  readonly unit: 'ratio'
  readonly peak_bin_index: number
  readonly peak_shift_cm_1: number
  readonly peak_wavelength_nm: number
  readonly signal_counts: number
  readonly noise_rms_counts: number
  readonly number_of_exposures: number
}
export interface AvailableRayleighOd extends AvailableMetric {
  readonly unit: 'OD'
  readonly transmission: number
  readonly excitation_wavelength_nm: number
}
const unavailable = (undefined_reason: string): UndefinedNumericalMetric =>
  Object.freeze({ status: 'undefined', value: null, undefined_reason })

/** Model path attenuation, not a calibrated filter T(lambda, AOI, polarization).
 * Reference is a unit Rayleigh return at Sample, before return-path losses;
 * output is at Spectrometer INPUT, excluding detector QE/grating/electronics. */
export const calculateContextRayleighOd = (context: RamanOpticalContext): AvailableRayleighOd | UndefinedNumericalMetric => {
  if (!context.rayleigh_return.geometric_path_reaches_spectrometer || context.excitation_wavelength_nm === null) {
    return unavailable('No traced Sample-return to Spectrometer-input path with an excitation wavelength; path transmission is unavailable.')
  }
  const transmission = context.rayleigh_return.leakage_throughput_to_spectrometer_input
  if (!(transmission > 0 && transmission <= 1)) {
    return unavailable('Zero model transmission: finite OD is unavailable (ideal rejection or numerical underflow cannot be distinguished).')
  }
  return Object.freeze({
    status: 'available', value: transmission === 1 ? 0 : -Math.log10(transmission), unit: 'OD',
    source: 'context.rayleigh_return.leakage_throughput_to_spectrometer_input',
    model_version: RAYLEIGH_OD_MODEL_VERSION, scientific_semantics: RAYLEIGH_OD_SEMANTICS,
    transmission, excitation_wavelength_nm: context.excitation_wavelength_nm,
  })
}

export const calculateRayleighOd = (input: AcquisitionInput): AvailableRayleighOd | UndefinedNumericalMetric =>
  calculateContextRayleighOd(input.instrument_snapshot.context)

/** RMS of the actual Phase 3 Gaussian generator, in output counts/bin.
 * Dark/background are ALREADY in expected counts. No extra gain or dark term.
 * Independent exposures reduce variance by N. This is a pre-clipping model. */
export const meanNoiseRmsCounts = (expectedCounts: number, readNoise: number, n: number): number => {
  if (!Number.isFinite(expectedCounts) || expectedCounts < 0 || !Number.isFinite(readNoise) || readNoise < 0 ||
      !Number.isSafeInteger(n) || n < 1) throw new RangeError('Noise RMS requires finite nonnegative counts/noise and positive safe N.')
  return Math.hypot(Math.sqrt(Math.max(expectedCounts, RAMAN_SANDBOX_NOISE_PARAMETERS.counting_variance_floor_counts)), readNoise) / Math.sqrt(n)
}

/** Predicted SNR at the strongest frozen Raman-component bin (first on ties),
 * not empirical SNR or Phase 5 peak detection. Raw mean supplies actual N and
 * accepted frames supply clipping evidence. Counts/mean are never processed. */
export const calculatePeakSnr = (input: AcquisitionInput, exposures: readonly AcquisitionExposure[], raw: RawAcquiredSpectrum): AvailablePeakSnr | UndefinedNumericalMetric => {
  if (raw.run_id !== input.id || raw.number_of_exposures !== input.request.number_of_exposures ||
      exposures.length !== raw.number_of_exposures) throw new RangeError('Peak SNR requires the matching complete N-frame mean.')
  const s = input.instrument_snapshot
  const context = s.context
  const axis = input.expected_spectrum.axis
  if (!context.excitation_reached_sample || context.excitation_wavelength_nm === null) {
    return unavailable('No excited Raman source: a positive model Raman peak is unavailable.')
  }
  if (!s.material.peaks.some((p) => p.relative_intensity > 0 && p.shift_cm_1 >= axis.values_cm_1[0]! && p.shift_cm_1 <= axis.values_cm_1.at(-1)!)) {
    return unavailable('Frozen axis contains no nonzero material reference peak; a Raman peak-bin signal is unavailable.')
  }
  const spectrum = synthesizeRamanSpectrumAtSpectrometerInput({ context, material: s.material,
    axis, excitation_wavelength_nm: context.excitation_wavelength_nm, spectrometer: s.spectrometer })
  // Reuse detector conversion, including QE/throughput/integration/gain exactly
  // once. signal_counts excludes dark; variance uses the ORIGINAL total CCD.
  const zero = spectrum.relative_intensity.map(() => 0)
  const ramanOnly = calculateExpectedCcdSpectrum({
    raman_domain_spectrum: { ...spectrum, relative_intensity: spectrum.components.raman,
      components: { raman: spectrum.components.raman, fluorescence: zero, rayleigh: zero } },
    spectrometer: s.spectrometer, detector: s.detector,
  })
  let index = 0
  ramanOnly.signal_counts.forEach((value, i) => { if (value > ramanOnly.signal_counts[index]!) index = i })
  const signal = ramanOnly.signal_counts[index]!
  if (!(signal > 0)) return unavailable('The model has no positive detected Raman peak; Raman signal input is zero.')
  if (input.expected_spectrum.saturated[index] || exposures.some((e) => e.clipped_low[index] || e.clipped_high[index])) {
    return unavailable('Selected Raman peak is saturated or clipped; a linear peak amplitude/noise estimate cannot be recovered from these counts.')
  }
  const noise = meanNoiseRmsCounts(input.expected_spectrum.expected_counts[index]!, s.detector.read_noise_rms_counts, raw.number_of_exposures)
  const value = signal / noise
  if (!(noise > 0) || !Number.isFinite(noise) || !(value > 0) || !Number.isFinite(value)) {
    return unavailable('Model peak signal/noise is outside finite representable numeric range.')
  }
  return Object.freeze({
    status: 'available', value, unit: 'ratio', source: 'frozen-raman-ccd-and-noise-model',
    model_version: PEAK_SNR_MODEL_VERSION, scientific_semantics: PEAK_SNR_SEMANTICS,
    peak_bin_index: index, peak_shift_cm_1: axis.values_cm_1[index]!,
    peak_wavelength_nm: input.expected_spectrum.scattered_wavelength_nm[index]!,
    signal_counts: signal, noise_rms_counts: noise, number_of_exposures: raw.number_of_exposures,
  })
}
