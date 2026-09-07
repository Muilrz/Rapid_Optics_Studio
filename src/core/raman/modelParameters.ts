import {
  RAMAN_SPECTRUM_MODEL_VERSION,
  RamanSpectrumSynthesisConfigurationSchema,
} from './contracts'

/** Exact unit conversion: 1 cm = 10^7 nm. */
export const WAVENUMBER_NM_CM_CONVERSION = 10_000_000

/** Documented numerical tolerance for shift → wavelength → shift tests. */
export const RAMAN_SHIFT_ROUND_TRIP_TOLERANCE_CM_1 = 1e-9

/**
 * Versioned Phase 3B parameters inherited from reference/raman_sandbox.html.
 * Detector-only GAIN, QE, throughput, integration, dark, read-noise, and
 * full-well constants are intentionally absent from this Raman-domain model.
 */
export const RAMAN_SANDBOX_EMPIRICAL_PARAMETERS = Object.freeze({
  model_version: RAMAN_SPECTRUM_MODEL_VERSION,
  provenance: 'reference/raman_sandbox.html computeSpectrum and drawBigSpec',
  raman_relative_scale: 1,
  instrument_half_width_cm_1: 6,
  edge_cutoff_offset_nm: 1.5,
  edge_transition_width_nm: 0.35,
  fluorescence_excitation_green_max_nm: 540,
  fluorescence_excitation_red_max_nm: 650,
  fluorescence_green_factor: 1,
  fluorescence_red_factor: 0.4,
  fluorescence_nir_factor: 0.1,
  fluorescence_center_cm_1: 900,
  fluorescence_width_cm_1: 1400,
  fluorescence_relative_scale: 2,
  rayleigh_center_cm_1: 0,
  rayleigh_half_width_cm_1: 5,
  rayleigh_reference_intensity: 1_000_000,
  auto_axis_minimum_shift_cm_1: -100,
  auto_axis_peak_padding_cm_1: 200,
  auto_axis_sample_count: 1400,
})

export const DEFAULT_RAMAN_SPECTRUM_SYNTHESIS_CONFIGURATION =
  RamanSpectrumSynthesisConfigurationSchema.parse({
    model_version: RAMAN_SPECTRUM_MODEL_VERSION,
    effective_excitation_scale: 1,
    rayleigh_leakage_scale: 0,
    broadening: {
      model: 'quadrature-half-width',
      instrument_half_width_cm_1:
        RAMAN_SANDBOX_EMPIRICAL_PARAMETERS.instrument_half_width_cm_1,
    },
  })
