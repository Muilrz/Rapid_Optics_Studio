import { z } from 'zod'
import {
  ComponentIdSchema,
  MillimetersSchema,
  NanometersSchema,
  NonNegativeMilliwattsSchema,
  PositiveMillimetersSchema,
  RayIdSchema,
  UnitIntervalSchema,
} from '../optics'
import { RamanMaterialIdSchema } from './contracts'
import { SIMPLIFIED_FOCUS_MODEL_VERSION } from './focus'

export const RAMAN_OPTICAL_CONTEXT_VERSION =
  'raman-optical-context-v1' as const

export const RamanOpticalPathStateSchema = z.enum([
  'no-excitation-path',
  'excited-no-return-path',
  'valid-signal-path',
])
export type RamanOpticalPathState = z.infer<
  typeof RamanOpticalPathStateSchema
>

export const RamanFocusStateSchema = z.enum([
  'not-excited',
  'no-objective-in-lineage',
  'lineage-focus',
])
export type RamanFocusState = z.infer<typeof RamanFocusStateSchema>

export const RamanFocusContextSchema = z
  .object({
    state: RamanFocusStateSchema,
    model_version: z.literal(SIMPLIFIED_FOCUS_MODEL_VERSION),
    objective_component_id: ComponentIdSchema.nullable(),
    target_focal_distance_mm: PositiveMillimetersSchema.nullable(),
    actual_distance_mm: MillimetersSchema.nonnegative().nullable(),
    defocus_mm: MillimetersSchema.nullable(),
    z_r_mm: PositiveMillimetersSchema,
    efficiency: UnitIntervalSchema,
  })
  .strict()
  .superRefine((focus, context) => {
    const lineageValues = [
      focus.objective_component_id,
      focus.target_focal_distance_mm,
      focus.actual_distance_mm,
      focus.defocus_mm,
    ]
    const hasAllLineageValues = lineageValues.every((value) => value !== null)
    const hasNoLineageValues = lineageValues.every((value) => value === null)
    if (
      (focus.state === 'lineage-focus' && !hasAllLineageValues) ||
      (focus.state !== 'lineage-focus' && !hasNoLineageValues)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Focus lineage fields must match the declared focus state.',
        path: ['state'],
      })
    }
  })
  .readonly()
export type RamanFocusContext = z.infer<typeof RamanFocusContextSchema>

export const RamanReturnPathContextSchema = z
  .object({
    path_reaches_spectrometer: z.boolean(),
    power_at_spectrometer_input_mw: NonNegativeMilliwattsSchema,
    throughput_to_spectrometer_input: UnitIntervalSchema,
    detected_return_probe_power_mw: NonNegativeMilliwattsSchema,
    throughput: UnitIntervalSchema,
    detected_effective_excitation_power_mw: NonNegativeMilliwattsSchema,
    spectrometer_component_ids: z.array(ComponentIdSchema).readonly(),
  })
  .strict()
  .readonly()
export type RamanReturnPathContext = z.infer<
  typeof RamanReturnPathContextSchema
>

export const RayleighPathContextSchema = z
  .object({
    geometric_path_reaches_spectrometer: z.boolean(),
    leakage_throughput_to_spectrometer_input: UnitIntervalSchema,
    effective_leakage_power_at_spectrometer_input_mw:
      NonNegativeMilliwattsSchema,
    leakage_throughput: UnitIntervalSchema,
    detected_effective_leakage_power_mw: NonNegativeMilliwattsSchema,
  })
  .strict()
  .readonly()
export type RayleighPathContext = z.infer<typeof RayleighPathContextSchema>

export const RamanOpticalContextSchema = z
  .object({
    model_version: z.literal(RAMAN_OPTICAL_CONTEXT_VERSION),
    path_state: RamanOpticalPathStateSchema,
    sample_component_id: ComponentIdSchema,
    material_id: RamanMaterialIdSchema,
    source_component_id: ComponentIdSchema.nullable(),
    excitation_ray_id: RayIdSchema.nullable(),
    sample_return_ray_id: RayIdSchema.nullable(),
    excitation_wavelength_nm: NanometersSchema.nullable(),
    excitation_reached_sample: z.boolean(),
    excitation_power_at_sample_mw: NonNegativeMilliwattsSchema,
    focus: RamanFocusContextSchema,
    effective_excitation_power_mw: NonNegativeMilliwattsSchema,
    raman_return: RamanReturnPathContextSchema,
    rayleigh_return: RayleighPathContextSchema,
  })
  .strict()
  .readonly()
export type RamanOpticalContext = z.infer<typeof RamanOpticalContextSchema>
