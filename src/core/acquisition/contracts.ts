import { z } from 'zod'
import {
  ComponentIdSchema,
  NanometersSchema,
  UnitIntervalSchema,
} from '../optics'
import {
  RAMAN_SPECTRUM_MODEL_VERSION,
  RamanMaterialIdSchema,
  SpectrumAxisSchema,
} from '../raman'

const finiteNumber = z.number().finite()
const nonNegativeFinite = finiteNumber.nonnegative()
const positiveFinite = finiteNumber.positive()

export const VIRTUAL_SPECTROMETER_MODEL_VERSION =
  'virtual-spectrometer-v1' as const
export const VIRTUAL_CCD_MODEL_VERSION = 'deterministic-ccd-v1' as const
export const EXPECTED_CCD_SPECTRUM_MODEL_VERSION =
  'expected-ccd-spectrum-v1' as const

export const SandboxGaussianQeModelSchema = z
  .object({
    kind: z.literal('sandbox-gaussian-floor-v1'),
    minimum_quantum_efficiency: UnitIntervalSchema,
    peak_quantum_efficiency: UnitIntervalSchema,
    center_wavelength_nm: NanometersSchema,
    width_nm: positiveFinite,
  })
  .strict()
  .refine(
    ({ minimum_quantum_efficiency, peak_quantum_efficiency }) =>
      minimum_quantum_efficiency <= peak_quantum_efficiency,
    {
      message: 'Minimum QE must not exceed peak QE.',
      path: ['minimum_quantum_efficiency'],
    },
  )
  .readonly()
export type SandboxGaussianQeModel = z.infer<
  typeof SandboxGaussianQeModelSchema
>

export const VirtualSpectrometerConfigurationSchema = z
  .object({
    model_version: z.literal(VIRTUAL_SPECTROMETER_MODEL_VERSION),
    spectrometer_component_id: ComponentIdSchema,
    /** Existing scene component throughput, applied once at detector input. */
    optical_throughput: UnitIntervalSchema,
    /** Fixed V1 grating efficiency inherited from the Raman Sandbox. */
    grating_throughput: UnitIntervalSchema,
    instrument_half_width_cm_1: nonNegativeFinite,
    incident_photon_scale_per_relative_intensity_second:
      nonNegativeFinite,
  })
  .strict()
  .readonly()
export type VirtualSpectrometerConfiguration = z.infer<
  typeof VirtualSpectrometerConfigurationSchema
>

export const VirtualCcdConfigurationSchema = z
  .object({
    model_version: z.literal(VIRTUAL_CCD_MODEL_VERSION),
    /** V1 convention: output counts per generated photoelectron. */
    gain_counts_per_photoelectron: positiveFinite,
    qe_model: SandboxGaussianQeModelSchema,
    /** V1/Sandbox saturation ceiling in output counts per sampled bin. */
    full_well_counts: positiveFinite,
    /** Contract-only in 3D; stochastic application is deferred to 3E. */
    read_noise_rms_counts: nonNegativeFinite,
    /** Deterministic output-count expectation per second and sampled bin. */
    dark_current_counts_per_second_per_bin: nonNegativeFinite,
    integration_time_s: nonNegativeFinite,
  })
  .strict()
  .readonly()
export type VirtualCcdConfiguration = z.infer<
  typeof VirtualCcdConfigurationSchema
>

const SpectrumValuesSchema = z
  .array(nonNegativeFinite)
  .min(2)
  .readonly()

export const ExpectedCcdSpectrumSchema = z
  .object({
    kind: z.literal('expected-ccd-spectrum'),
    model_version: z.literal(EXPECTED_CCD_SPECTRUM_MODEL_VERSION),
    source_spectrum_kind: z.literal('expected-raman-spectrum'),
    source_raman_model_version: z.literal(RAMAN_SPECTRUM_MODEL_VERSION),
    material_id: RamanMaterialIdSchema,
    axis: SpectrumAxisSchema,
    scattered_wavelength_nm: z
      .array(NanometersSchema)
      .min(2)
      .readonly(),
    quantum_efficiency: z
      .array(UnitIntervalSchema)
      .min(2)
      .readonly(),
    signal_counts: SpectrumValuesSchema,
    dark_counts: SpectrumValuesSchema,
    unclipped_expected_counts: SpectrumValuesSchema,
    expected_counts: SpectrumValuesSchema,
    saturated: z.array(z.boolean()).min(2).readonly(),
    saturated_bin_count: z.number().int().nonnegative(),
    spectrometer: VirtualSpectrometerConfigurationSchema,
    detector: VirtualCcdConfigurationSchema,
  })
  .strict()
  .superRefine((spectrum, context) => {
    const expectedLength = spectrum.axis.values_cm_1.length
    const arrays = [
      ['scattered_wavelength_nm', spectrum.scattered_wavelength_nm],
      ['quantum_efficiency', spectrum.quantum_efficiency],
      ['signal_counts', spectrum.signal_counts],
      ['dark_counts', spectrum.dark_counts],
      ['unclipped_expected_counts', spectrum.unclipped_expected_counts],
      ['expected_counts', spectrum.expected_counts],
      ['saturated', spectrum.saturated],
    ] as const

    for (const [path, values] of arrays) {
      if (values.length !== expectedLength) {
        context.addIssue({
          code: 'custom',
          message: 'All expected CCD spectrum arrays must have equal length.',
          path: [path],
        })
      }
    }

    const saturatedCount = spectrum.saturated.filter(Boolean).length
    if (spectrum.saturated_bin_count !== saturatedCount) {
      context.addIssue({
        code: 'custom',
        message: 'Saturated-bin count must match the saturation mask.',
        path: ['saturated_bin_count'],
      })
    }

    for (let index = 0; index < spectrum.expected_counts.length; index += 1) {
      if (spectrum.expected_counts[index]! > spectrum.detector.full_well_counts) {
        context.addIssue({
          code: 'custom',
          message: 'Expected CCD counts must not exceed full well.',
          path: ['expected_counts', index],
        })
      }
    }
  })
  .readonly()
export type ExpectedCcdSpectrum = z.infer<typeof ExpectedCcdSpectrumSchema>
