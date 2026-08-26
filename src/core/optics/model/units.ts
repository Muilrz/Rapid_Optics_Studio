import { z } from 'zod'

/**
 * Public optical data uses millimetres for length and degrees for angles.
 * Screen-space values belong to the view layer and must never use these schemas.
 */
export const OPTICAL_UNIT_CONVENTION = {
  length: 'mm',
  publicAngle: 'degree',
} as const

const finiteNumber = z.number().finite()

export const MillimetersSchema = finiteNumber.brand<'Millimeters'>()
export type Millimeters = z.infer<typeof MillimetersSchema>

export const PositiveMillimetersSchema = finiteNumber
  .positive()
  .brand<'PositiveMillimeters'>()
export type PositiveMillimeters = z.infer<
  typeof PositiveMillimetersSchema
>

export const DegreesSchema = finiteNumber.brand<'Degrees'>()
export type Degrees = z.infer<typeof DegreesSchema>

export const NanometersSchema = finiteNumber
  .min(100, 'Wavelength must be at least 100 nm.')
  .max(100_000, 'Wavelength must not exceed 100,000 nm.')
  .brand<'Nanometers'>()
export type Nanometers = z.infer<typeof NanometersSchema>

export const MilliwattsSchema = finiteNumber
  .positive('Laser power must be greater than zero.')
  .max(1_000_000, 'Laser power exceeds the supported V1 range.')
  .brand<'Milliwatts'>()
export type Milliwatts = z.infer<typeof MilliwattsSchema>

export const UnitIntervalSchema = finiteNumber
  .min(0)
  .max(1)
  .brand<'UnitInterval'>()
export type UnitInterval = z.infer<typeof UnitIntervalSchema>

export const NonNegativeOpticalDensitySchema = finiteNumber
  .nonnegative()
  .max(20)
  .brand<'OpticalDensity'>()
export type OpticalDensity = z.infer<
  typeof NonNegativeOpticalDensitySchema
>
