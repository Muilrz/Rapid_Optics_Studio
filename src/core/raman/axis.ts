import {
  RamanMaterialSchema,
  SpectrumAxisConfigurationSchema,
  SpectrumAxisSchema,
  type RamanMaterial,
  type SpectrumAxis,
  type SpectrumAxisConfiguration,
} from './contracts'
import { RAMAN_SANDBOX_EMPIRICAL_PARAMETERS } from './modelParameters'

const createEvenlySpacedAxis = (
  minimum_shift_cm_1: number,
  maximum_shift_cm_1: number,
  sample_count: number,
): SpectrumAxis => {
  const step =
    (maximum_shift_cm_1 - minimum_shift_cm_1) / (sample_count - 1)
  const values = Array.from(
    { length: sample_count },
    (_, index) =>
      index === sample_count - 1
        ? maximum_shift_cm_1
        : minimum_shift_cm_1 + step * index,
  )

  return SpectrumAxisSchema.parse({
    kind: 'raman-shift',
    unit: 'cm^-1',
    values_cm_1: values,
  })
}

export const createCustomSpectrumAxis = (
  configuration: Extract<SpectrumAxisConfiguration, { mode: 'custom' }>,
): SpectrumAxis => {
  const parsed = SpectrumAxisConfigurationSchema.parse(configuration)
  if (parsed.mode !== 'custom') {
    throw new TypeError('Custom spectrum axis requires custom configuration.')
  }
  return createEvenlySpacedAxis(
    parsed.minimum_shift_cm_1,
    parsed.maximum_shift_cm_1,
    parsed.sample_count,
  )
}

export const createAutoSpectrumAxis = (
  material: RamanMaterial,
  sampleCount?: number,
): SpectrumAxis => {
  const parsedMaterial = RamanMaterialSchema.parse(material)
  const parsedConfiguration = SpectrumAxisConfigurationSchema.parse({
    mode: 'auto',
    sample_count: sampleCount,
  })
  const parameters = RAMAN_SANDBOX_EMPIRICAL_PARAMETERS
  const peakShifts = parsedMaterial.peaks.map(({ shift_cm_1 }) => shift_cm_1)
  const minimumPeak = Math.min(...peakShifts)
  const maximumPeak = Math.max(...peakShifts)
  const minimum = Math.min(
    parameters.auto_axis_minimum_shift_cm_1,
    minimumPeak - parameters.auto_axis_peak_padding_cm_1,
  )
  const maximum = Math.max(
    parameters.rayleigh_center_cm_1 +
      parameters.auto_axis_peak_padding_cm_1,
    maximumPeak + parameters.auto_axis_peak_padding_cm_1,
  )

  return createEvenlySpacedAxis(
    minimum,
    maximum,
    parsedConfiguration.sample_count ?? parameters.auto_axis_sample_count,
  )
}

export const createSpectrumAxis = (
  material: RamanMaterial,
  configuration: SpectrumAxisConfiguration = { mode: 'auto' },
): SpectrumAxis => {
  const parsed = SpectrumAxisConfigurationSchema.parse(configuration)
  return parsed.mode === 'auto'
    ? createAutoSpectrumAxis(material, parsed.sample_count)
    : createCustomSpectrumAxis(parsed)
}
