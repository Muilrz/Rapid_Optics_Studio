import { z } from 'zod'
import { BreadboardIdSchema, Vec2Schema } from './primitives'
import { OpticalComponentSchema } from './components'
import { MillimetersSchema, PositiveMillimetersSchema } from './units'

export const BreadboardSchema = z
  .object({
    id: BreadboardIdSchema,
    name: z.string().trim().min(1).max(128),
    origin_mm: Vec2Schema,
    width_mm: PositiveMillimetersSchema,
    height_mm: PositiveMillimetersSchema,
    hole_pitch_mm: PositiveMillimetersSchema,
  })
  .strict()
export type Breadboard = z.infer<typeof BreadboardSchema>

export const OpticalSceneSchema = z
  .object({
    breadboards: z.array(BreadboardSchema),
    components: z.array(OpticalComponentSchema),
  })
  .strict()
  .superRefine(({ breadboards, components }, context) => {
    const ids = new Set<string>()

    for (const [index, item] of [...breadboards, ...components].entries()) {
      if (ids.has(item.id)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate scene ID: ${item.id}`,
          path: [index < breadboards.length ? 'breadboards' : 'components'],
        })
      }
      ids.add(item.id)
    }
  })
export type OpticalScene = z.infer<typeof OpticalSceneSchema>

export const SimulationConfigurationSchema = z
  .object({
    model_version: z.literal('optics-v1'),
    min_ray_power: z.number().finite().positive().max(1),
    max_generations: z.number().int().min(1).max(256),
    max_rays: z.number().int().min(1).max(100_000),
    scene_escape_distance_mm: MillimetersSchema.positive(),
  })
  .strict()
export type SimulationConfiguration = z.infer<
  typeof SimulationConfigurationSchema
>
