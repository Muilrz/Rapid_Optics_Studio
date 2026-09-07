import { z } from 'zod'
import {
  MaterialIdSchema,
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

/** A phenomenological Raman reference peak; no line-shape math is implied. */
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

/**
 * Foundation for deterministic Raman-domain output. Detector-count semantics
 * remain owned by the later Virtual CCD sub-phase.
 */
export const ExpectedSpectrumSchema = z
  .object({
    kind: z.literal('expected-raman-spectrum'),
    axis: SpectrumAxisSchema,
    relative_intensity: z.array(finiteNumber.nonnegative()).min(2).readonly(),
    model_version: StableIdSchema,
  })
  .strict()
  .superRefine(({ axis, relative_intensity }, context) => {
    if (axis.values_cm_1.length !== relative_intensity.length) {
      context.addIssue({
        code: 'custom',
        message: 'Spectrum axis and intensity arrays must have equal length.',
        path: ['relative_intensity'],
      })
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
