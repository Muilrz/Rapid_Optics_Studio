import { z } from 'zod'
import { NanometersSchema } from './units'
import { StableIdSchema } from './primitives'

export const LaserWavelengthPresetSchema = z
  .object({
    id: StableIdSchema,
    label: z.string().trim().min(1).max(64),
    wavelength_nm: NanometersSchema,
  })
  .strict()
export type LaserWavelengthPreset = z.infer<
  typeof LaserWavelengthPresetSchema
>
