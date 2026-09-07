import { z } from 'zod'
import { PositiveMillimetersSchema } from '../optics'

export const SIMPLIFIED_FOCUS_MODEL_VERSION = 'simplified-focus-v1' as const

/**
 * The Sandbox used a focus-depth scale of 1.5 reference grid pitches. The
 * formal model converts that once to 37.5 mm using the 25 mm breadboard pitch.
 * This is a provisional first-order parameter, not Gaussian-beam propagation.
 */
export const SIMPLIFIED_FOCUS_MODEL_PARAMETERS = Object.freeze({
  model_version: SIMPLIFIED_FOCUS_MODEL_VERSION,
  provenance:
    'reference/raman_sandbox.html ZR scale: 1.5 reference grid pitches at 25 mm per pitch',
  z_r_mm: 37.5,
  interpretation: 'provisional first-order defocus scale',
})

export const SimplifiedFocusConfigurationSchema = z
  .object({
    model_version: z.literal(SIMPLIFIED_FOCUS_MODEL_VERSION),
    z_r_mm: PositiveMillimetersSchema,
  })
  .strict()
  .readonly()
export type SimplifiedFocusConfiguration = z.infer<
  typeof SimplifiedFocusConfigurationSchema
>

export const DEFAULT_SIMPLIFIED_FOCUS_CONFIGURATION =
  SimplifiedFocusConfigurationSchema.parse({
    model_version: SIMPLIFIED_FOCUS_MODEL_VERSION,
    z_r_mm: SIMPLIFIED_FOCUS_MODEL_PARAMETERS.z_r_mm,
  })

/** η = 1 / (1 + (dz / zR)^2), with dz and zR both expressed in mm. */
export const calculateSimplifiedFocusEfficiency = (
  defocus_mm: number,
  z_r_mm: number,
): number => {
  if (!Number.isFinite(defocus_mm)) {
    throw new RangeError('Defocus must be finite and expressed in millimetres.')
  }
  const parsedZr = PositiveMillimetersSchema.parse(z_r_mm)
  const normalizedDefocus = defocus_mm / parsedZr
  const efficiency = 1 / (1 + normalizedDefocus * normalizedDefocus)
  if (!Number.isFinite(efficiency) || efficiency < 0 || efficiency > 1) {
    throw new RangeError('Simplified focus efficiency must be finite in [0, 1].')
  }
  return efficiency
}
