import {
  CCD_NOISE_MODEL_VERSION,
  VIRTUAL_CCD_MODEL_VERSION,
  VIRTUAL_SPECTROMETER_MODEL_VERSION,
  VirtualCcdConfigurationSchema,
} from './contracts'

/**
 * Versioned Phase 3D empirical parameters inherited from
 * reference/raman_sandbox.html computeSpectrum. Names expose the adopted V1
 * units and conventions instead of treating the prototype constants as
 * physical truth.
 */
export const RAMAN_SANDBOX_DETECTOR_PARAMETERS = Object.freeze({
  provenance: 'reference/raman_sandbox.html computeSpectrum',
  spectrometer_model_version: VIRTUAL_SPECTROMETER_MODEL_VERSION,
  detector_model_version: VIRTUAL_CCD_MODEL_VERSION,
  gain_counts_per_photoelectron: 340,
  full_well_counts: 60_000,
  read_noise_rms_counts: 3,
  dark_current_counts_per_second_per_bin: 0.01,
  default_integration_time_s: 1,
  grating_throughput: 0.7,
  instrument_half_width_cm_1: 6,
  incident_photon_scale_per_relative_intensity_second: 50,
  qe_model: Object.freeze({
    kind: 'sandbox-gaussian-floor-v1' as const,
    minimum_quantum_efficiency: 0.02,
    peak_quantum_efficiency: 0.9,
    center_wavelength_nm: 600,
    width_nm: 250,
  }),
  gain_convention:
    'higher gain linearly increases output counts per photoelectron',
  full_well_convention:
    'deterministic clipping ceiling in output counts per sampled bin',
  read_noise_phase: 'applied only by seeded Phase 3E preview exposure',
})

export const DEFAULT_VIRTUAL_CCD_CONFIGURATION =
  VirtualCcdConfigurationSchema.parse({
    model_version: VIRTUAL_CCD_MODEL_VERSION,
    gain_counts_per_photoelectron:
      RAMAN_SANDBOX_DETECTOR_PARAMETERS.gain_counts_per_photoelectron,
    qe_model: RAMAN_SANDBOX_DETECTOR_PARAMETERS.qe_model,
    full_well_counts:
      RAMAN_SANDBOX_DETECTOR_PARAMETERS.full_well_counts,
    read_noise_rms_counts:
      RAMAN_SANDBOX_DETECTOR_PARAMETERS.read_noise_rms_counts,
    dark_current_counts_per_second_per_bin:
      RAMAN_SANDBOX_DETECTOR_PARAMETERS.dark_current_counts_per_second_per_bin,
    integration_time_s:
      RAMAN_SANDBOX_DETECTOR_PARAMETERS.default_integration_time_s,
  })

/**
 * The Sandbox used two independent Box-Muller normal draws per bin:
 * `sqrt(max(expected, 1)) * N(0,1)` for signal + dark counting noise and
 * `readNoise * N(0,1)` for read noise, followed by detector-bound clipping.
 */
export const RAMAN_SANDBOX_NOISE_PARAMETERS = Object.freeze({
  provenance: 'reference/raman_sandbox.html randn and withNoise',
  model_version: CCD_NOISE_MODEL_VERSION,
  counting_noise_model:
    'Gaussian approximation to combined signal-shot and dark expectation',
  counting_variance_floor_counts: 1,
  normal_sampler: 'Box-Muller cosine branch with two uniform draws',
  read_noise_model: 'independent zero-mean Gaussian in output counts',
  output_bounds: 'clip to zero and detector full-well counts',
  interpretation: 'simplified stochastic preview model, not exact Poisson CCD',
})

export const MULBERRY32_RNG_PARAMETERS = Object.freeze({
  algorithm: 'mulberry32-v1',
  state_increment_uint32: 0x6d2b_79f5,
  output_divisor: 0x1_0000_0000,
  interpretation: 'deterministic seeded 32-bit preview RNG',
})
