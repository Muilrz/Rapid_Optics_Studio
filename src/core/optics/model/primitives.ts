import { z } from 'zod'
import {
  DegreesSchema,
  MillimetersSchema,
  PositiveMillimetersSchema,
} from './units'

export const StableIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9._:-]*$/,
    'IDs may contain letters, numbers, dot, underscore, colon, and hyphen.',
  )

export const ComponentIdSchema = StableIdSchema.brand<'ComponentId'>()
export type ComponentId = z.infer<typeof ComponentIdSchema>

export const BreadboardIdSchema = StableIdSchema.brand<'BreadboardId'>()
export type BreadboardId = z.infer<typeof BreadboardIdSchema>

export const MaterialIdSchema = StableIdSchema.brand<'MaterialId'>()
export type MaterialId = z.infer<typeof MaterialIdSchema>

/** Generic finite 2D components; the owning contract supplies physical units. */
export const Vec2Schema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
  })
  .strict()
export type Vec2 = z.infer<typeof Vec2Schema>

export const Transform2DSchema = z
  .object({
    x_mm: MillimetersSchema,
    y_mm: MillimetersSchema,
    rotation_deg: DegreesSchema,
  })
  .strict()
export type Transform2D = z.infer<typeof Transform2DSchema>

/** Full clear optical aperture (diameter/width), never a display radius. */
export const OpticalGeometrySchema = z
  .object({
    aperture_mm: PositiveMillimetersSchema,
  })
  .strict()
export type OpticalGeometry = z.infer<typeof OpticalGeometrySchema>

/** Presentation-only dimensions; Optical Core calculations must ignore them. */
export const ComponentVisualizationSchema = z
  .object({
    beam_height_mm: MillimetersSchema.nonnegative(),
    post_height_mm: MillimetersSchema.nonnegative(),
    visual_depth_mm: PositiveMillimetersSchema,
    holder: z.boolean(),
  })
  .strict()
export type ComponentVisualization = z.infer<
  typeof ComponentVisualizationSchema
>

export const ComponentMetadataSchema = z
  .object({
    manufacturer: z.string().trim().min(1).max(128).optional(),
    model: z.string().trim().min(1).max(128).optional(),
    part_number: z.string().trim().min(1).max(128).optional(),
    datasheet: z.string().url().optional(),
    source: z.string().trim().min(1).max(128).optional(),
    inventory_id: StableIdSchema.optional(),
  })
  .strict()
export type ComponentMetadata = z.infer<typeof ComponentMetadataSchema>

export const CommonComponentShape = {
  id: ComponentIdSchema,
  name: z.string().trim().min(1).max(128),
  enabled: z.boolean(),
  transform: Transform2DSchema,
  geometry: OpticalGeometrySchema,
  visualization: ComponentVisualizationSchema,
  metadata: ComponentMetadataSchema,
} as const
