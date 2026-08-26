import { z } from 'zod'
import {
  DegreesSchema,
  MillimetersSchema,
  MilliwattsSchema,
  NanometersSchema,
  NonNegativeOpticalDensitySchema,
  UnitIntervalSchema,
} from './units'
import { CommonComponentShape, MaterialIdSchema } from './primitives'

export const LaserParametersSchema = z
  .object({
    wavelength_nm: NanometersSchema,
    power_mw: MilliwattsSchema,
  })
  .strict()

export const MirrorParametersSchema = z
  .object({
    reflectivity: UnitIntervalSchema,
  })
  .strict()

export const DichroicParametersSchema = z
  .object({
    excitation_reflectivity: UnitIntervalSchema,
    excitation_transmission: UnitIntervalSchema,
    raman_transmission: UnitIntervalSchema,
  })
  .strict()
  .refine(
    ({ excitation_reflectivity, excitation_transmission }) =>
      excitation_reflectivity + excitation_transmission <= 1 + 1e-12,
    {
      message:
        'Dichroic excitation reflection and transmission must sum to at most 1.',
      path: ['excitation_transmission'],
    },
  )

export const ObjectiveParametersSchema = z
  .object({
    focal_length_mm: MillimetersSchema.positive(),
    numerical_aperture: z.number().finite().positive().max(2),
  })
  .strict()

export const SampleParametersSchema = z
  .object({
    material_id: MaterialIdSchema,
  })
  .strict()

export const FilterParametersSchema = z
  .object({
    raman_transmission: UnitIntervalSchema,
    rayleigh_suppression_od: NonNegativeOpticalDensitySchema,
    leakage_model: z.enum(['constant', 'angle-dependent']),
  })
  .strict()

export const SpectrometerParametersSchema = z
  .object({
    optical_throughput: UnitIntervalSchema,
    acceptance_half_angle_deg: DegreesSchema.refine(
      (value) => value >= 0 && value <= 90,
      'Acceptance half-angle must be between 0 and 90 degrees.',
    ),
  })
  .strict()

export const PrismParametersSchema = z
  .object({
    deflection_angle_deg: DegreesSchema,
  })
  .strict()

export const BeamSplitterParametersSchema = z
  .object({
    transmission_ratio: UnitIntervalSchema,
    reflection_ratio: UnitIntervalSchema,
  })
  .strict()
  .refine(
    ({ transmission_ratio, reflection_ratio }) =>
      transmission_ratio + reflection_ratio <= 1 + 1e-12,
    {
      message:
        'Beam splitter transmission and reflection ratios must sum to at most 1.',
      path: ['transmission_ratio'],
    },
  )

export const PinholeParametersSchema = z
  .object({
    model: z.literal('geometric-aperture'),
  })
  .strict()

export const LaserComponentSchema = z
  .object({
    ...CommonComponentShape,
    type: z.literal('laser'),
    parameters: LaserParametersSchema,
  })
  .strict()

export const MirrorComponentSchema = z
  .object({
    ...CommonComponentShape,
    type: z.literal('mirror'),
    parameters: MirrorParametersSchema,
  })
  .strict()

export const DichroicComponentSchema = z
  .object({
    ...CommonComponentShape,
    type: z.literal('dichroic'),
    parameters: DichroicParametersSchema,
  })
  .strict()

export const ObjectiveComponentSchema = z
  .object({
    ...CommonComponentShape,
    type: z.literal('objective'),
    parameters: ObjectiveParametersSchema,
  })
  .strict()

export const SampleComponentSchema = z
  .object({
    ...CommonComponentShape,
    type: z.literal('sample'),
    parameters: SampleParametersSchema,
  })
  .strict()

export const FilterComponentSchema = z
  .object({
    ...CommonComponentShape,
    type: z.literal('filter'),
    parameters: FilterParametersSchema,
  })
  .strict()

export const SpectrometerComponentSchema = z
  .object({
    ...CommonComponentShape,
    type: z.literal('spectrometer'),
    parameters: SpectrometerParametersSchema,
  })
  .strict()

export const PrismComponentSchema = z
  .object({
    ...CommonComponentShape,
    type: z.literal('prism'),
    parameters: PrismParametersSchema,
  })
  .strict()

export const BeamSplitterComponentSchema = z
  .object({
    ...CommonComponentShape,
    type: z.literal('beam-splitter'),
    parameters: BeamSplitterParametersSchema,
  })
  .strict()

export const PinholeComponentSchema = z
  .object({
    ...CommonComponentShape,
    type: z.literal('pinhole'),
    parameters: PinholeParametersSchema,
  })
  .strict()

export const OpticalComponentSchema = z.discriminatedUnion('type', [
  LaserComponentSchema,
  MirrorComponentSchema,
  DichroicComponentSchema,
  ObjectiveComponentSchema,
  SampleComponentSchema,
  FilterComponentSchema,
  SpectrometerComponentSchema,
  PrismComponentSchema,
  BeamSplitterComponentSchema,
  PinholeComponentSchema,
])

export type LaserComponent = z.infer<typeof LaserComponentSchema>
export type MirrorComponent = z.infer<typeof MirrorComponentSchema>
export type DichroicComponent = z.infer<typeof DichroicComponentSchema>
export type ObjectiveComponent = z.infer<typeof ObjectiveComponentSchema>
export type SampleComponent = z.infer<typeof SampleComponentSchema>
export type FilterComponent = z.infer<typeof FilterComponentSchema>
export type SpectrometerComponent = z.infer<
  typeof SpectrometerComponentSchema
>
export type PrismComponent = z.infer<typeof PrismComponentSchema>
export type BeamSplitterComponent = z.infer<
  typeof BeamSplitterComponentSchema
>
export type PinholeComponent = z.infer<typeof PinholeComponentSchema>
export type OpticalComponent = z.infer<typeof OpticalComponentSchema>
export type OpticalComponentType = OpticalComponent['type']
