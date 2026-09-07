import { z } from 'zod'
import {
  MaterialIdSchema,
  NanometersSchema,
  StableIdSchema,
} from '../optics'

const finiteNumber = z.number().finite()

/** Material definitions reject surrounding whitespace instead of normalizing IDs. */
export const RamanMaterialIdSchema = z
  .string()
  .refine((value) => value === value.trim(), {
    message: 'Raman material IDs must not contain surrounding whitespace.',
  })
  .pipe(MaterialIdSchema)

/**
 * A phenomenological Raman reference peak. `width_cm_1` preserves the
 * Sandbox Lorentzian half-width parameter; it is not silently converted.
 */
export const RamanPeakSchema = z
  .object({
    shift_cm_1: finiteNumber,
    relative_intensity: finiteNumber.nonnegative(),
    width_cm_1: finiteNumber.positive(),
    assignment: z.string().trim().min(1).max(512).optional(),
  })
  .strict()
  .readonly()
export type RamanPeak = z.infer<typeof RamanPeakSchema>

/** Material data is relative/phenomenological, not an absolute cross-section. */
export const RamanMaterialSchema = z
  .object({
    id: RamanMaterialIdSchema,
    name: z.string().trim().min(1).max(128),
    fluorescence_level: finiteNumber.nonnegative(),
    peaks: z.array(RamanPeakSchema).min(1).readonly(),
  })
  .strict()
  .readonly()
export type RamanMaterial = z.infer<typeof RamanMaterialSchema>

/** Versioned provenance for an immutable material collection. */
export const RamanMaterialDatasetSchema = z
  .object({
    model_version: StableIdSchema,
    provenance: z.string().trim().min(1).max(512),
    materials: z.array(RamanMaterialSchema).min(1).readonly(),
  })
  .strict()
  .readonly()
export type RamanMaterialDataset = z.infer<
  typeof RamanMaterialDatasetSchema
>

/**
 * Explicit Raman-shift samples for later deterministic spectrum calculation.
 * Phase 3A validates axis data only; it does not generate an axis.
 */
export const SpectrumAxisSchema = z
  .object({
    kind: z.literal('raman-shift'),
    unit: z.literal('cm^-1'),
    values_cm_1: z.array(finiteNumber).min(2).readonly(),
  })
  .strict()
  .superRefine(({ values_cm_1 }, context) => {
    for (let index = 1; index < values_cm_1.length; index += 1) {
      if (values_cm_1[index]! <= values_cm_1[index - 1]!) {
        context.addIssue({
          code: 'custom',
          message: 'Spectrum axis values must be strictly increasing.',
          path: ['values_cm_1', index],
        })
      }
    }
  })
  .readonly()
export type SpectrumAxis = z.infer<typeof SpectrumAxisSchema>

export const SpectrumAxisConfigurationSchema = z.discriminatedUnion('mode', [
  z
    .object({
      mode: z.literal('auto'),
      sample_count: z.number().int().min(2).max(1_000_000).optional(),
    })
    .strict()
    .readonly(),
  z
    .object({
      mode: z.literal('custom'),
      minimum_shift_cm_1: finiteNumber,
      maximum_shift_cm_1: finiteNumber,
      sample_count: z.number().int().min(2).max(1_000_000),
    })
    .strict()
    .refine(
      ({ minimum_shift_cm_1, maximum_shift_cm_1 }) =>
        maximum_shift_cm_1 > minimum_shift_cm_1,
      {
        message: 'Custom spectrum maximum shift must exceed its minimum.',
        path: ['maximum_shift_cm_1'],
      },
    )
    .readonly(),
])
export type SpectrumAxisConfiguration = z.infer<
  typeof SpectrumAxisConfigurationSchema
>

export const SpectralBroadeningConfigurationSchema = z
  .object({
    model: z.literal('quadrature-half-width'),
    instrument_half_width_cm_1: finiteNumber.nonnegative(),
  })
  .strict()
  .readonly()
export type SpectralBroadeningConfiguration = z.infer<
  typeof SpectralBroadeningConfigurationSchema
>

export const RAMAN_SPECTRUM_MODEL_VERSION = 'raman-spectrum-v1' as const

export const RamanSpectrumSynthesisConfigurationSchema = z
  .object({
    model_version: z.literal(RAMAN_SPECTRUM_MODEL_VERSION),
    effective_excitation_scale: finiteNumber.nonnegative(),
    rayleigh_leakage_scale: finiteNumber.nonnegative(),
    broadening: SpectralBroadeningConfigurationSchema,
  })
  .strict()
  .readonly()
export type RamanSpectrumSynthesisConfiguration = z.infer<
  typeof RamanSpectrumSynthesisConfigurationSchema
>

const SpectrumValuesSchema = z
  .array(finiteNumber.nonnegative())
  .min(2)
  .readonly()

export const ExpectedSpectrumComponentsSchema = z
  .object({
    raman: SpectrumValuesSchema,
    fluorescence: SpectrumValuesSchema,
    rayleigh: SpectrumValuesSchema,
  })
  .strict()
  .readonly()
export type ExpectedSpectrumComponents = z.infer<
  typeof ExpectedSpectrumComponentsSchema
>

/**
 * Foundation for deterministic Raman-domain output. Detector-count semantics
 * remain owned by the later Virtual CCD sub-phase.
 */
export const ExpectedSpectrumSchema = z
  .object({
    kind: z.literal('expected-raman-spectrum'),
    material_id: RamanMaterialIdSchema,
    excitation_wavelength_nm: NanometersSchema,
    axis: SpectrumAxisSchema,
    scattered_wavelength_nm: z.array(finiteNumber.positive()).min(2).readonly(),
    relative_intensity: z.array(finiteNumber.nonnegative()).min(2).readonly(),
    components: ExpectedSpectrumComponentsSchema,
    model_version: z.literal(RAMAN_SPECTRUM_MODEL_VERSION),
  })
  .strict()
  .superRefine((spectrum, context) => {
    const expectedLength = spectrum.axis.values_cm_1.length
    const arrays = [
      ['scattered_wavelength_nm', spectrum.scattered_wavelength_nm],
      ['relative_intensity', spectrum.relative_intensity],
      ['components.raman', spectrum.components.raman],
      ['components.fluorescence', spectrum.components.fluorescence],
      ['components.rayleigh', spectrum.components.rayleigh],
    ] as const

    for (const [path, values] of arrays) {
      if (values.length !== expectedLength) {
        context.addIssue({
          code: 'custom',
          message: 'All spectrum arrays must have equal length.',
          path: path.split('.'),
        })
      }
    }
  })
  .readonly()
export type ExpectedSpectrum = z.infer<typeof ExpectedSpectrumSchema>

export const RAMAN_MODEL_VERSION = 'raman-v1' as const

/** Minimal configuration identity; numerical model parameters arrive in 3B+. */
export const RamanModelConfigurationSchema = z
  .object({
    model_version: z.literal(RAMAN_MODEL_VERSION),
    material_id: RamanMaterialIdSchema,
  })
  .strict()
  .readonly()
export type RamanModelConfiguration = z.infer<
  typeof RamanModelConfigurationSchema
>
