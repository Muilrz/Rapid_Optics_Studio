import {
  ExpectedSpectrumSchema,
  RamanMaterialSchema,
  RamanSpectrumSynthesisConfigurationSchema,
  SpectrumAxisSchema,
  type ExpectedSpectrum,
  type RamanMaterial,
  type RamanSpectrumSynthesisConfiguration,
  type SpectrumAxis,
} from './contracts'
import { RAMAN_SANDBOX_EMPIRICAL_PARAMETERS } from './modelParameters'
import {
  combineHalfWidthsInQuadrature,
  excitationLineEdgeResponse,
  fluorescenceBackground,
  lorentzianProfile,
  rayleighContribution,
  wavelengthDependentRamanScaling,
} from './profiles'
import { ramanShiftToScatteredWavelengthNm } from './wavelength'

export interface RamanSpectrumSynthesisInput {
  readonly material: RamanMaterial
  readonly excitation_wavelength_nm: number
  readonly axis: SpectrumAxis
  readonly configuration: RamanSpectrumSynthesisConfiguration
}

const assertFiniteContribution = (value: number, label: string): number => {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be finite and non-negative.`)
  }
  return value
}

/** Pure deterministic Raman-domain synthesis; no trace or detector state. */
export const synthesizeExpectedRamanSpectrum = (
  input: RamanSpectrumSynthesisInput,
): ExpectedSpectrum => {
  const material = RamanMaterialSchema.parse(input.material)
  const axis = SpectrumAxisSchema.parse(input.axis)
  const configuration = RamanSpectrumSynthesisConfigurationSchema.parse(
    input.configuration,
  )
  const parameters = RAMAN_SANDBOX_EMPIRICAL_PARAMETERS
  const scatteredWavelengths: number[] = []
  const ramanValues: number[] = []
  const fluorescenceValues: number[] = []
  const rayleighValues: number[] = []
  const totalValues: number[] = []

  for (const shift_cm_1 of axis.values_cm_1) {
    const scatteredWavelength_nm = ramanShiftToScatteredWavelengthNm(
      input.excitation_wavelength_nm,
      shift_cm_1,
    )
    let lineProfile = 0

    for (const peak of material.peaks) {
      const effectiveHalfWidth = combineHalfWidthsInQuadrature(
        peak.width_cm_1,
        configuration.broadening.instrument_half_width_cm_1,
      )
      lineProfile +=
        peak.relative_intensity *
        lorentzianProfile(
          shift_cm_1,
          peak.shift_cm_1,
          effectiveHalfWidth,
        )
    }

    const raman = assertFiniteContribution(
      configuration.effective_excitation_scale *
        parameters.raman_relative_scale *
        lineProfile *
        wavelengthDependentRamanScaling(
          input.excitation_wavelength_nm,
          scatteredWavelength_nm,
        ) *
        excitationLineEdgeResponse(
          input.excitation_wavelength_nm,
          scatteredWavelength_nm,
        ),
      'Raman contribution',
    )
    const fluorescence = fluorescenceBackground(
      shift_cm_1,
      input.excitation_wavelength_nm,
      material.fluorescence_level,
      configuration.effective_excitation_scale,
    )
    const rayleigh = rayleighContribution(
      shift_cm_1,
      configuration.rayleigh_leakage_scale,
    )
    const total = assertFiniteContribution(
      raman + fluorescence + rayleigh,
      'Total Raman-domain intensity',
    )

    scatteredWavelengths.push(scatteredWavelength_nm)
    ramanValues.push(raman)
    fluorescenceValues.push(fluorescence)
    rayleighValues.push(rayleigh)
    totalValues.push(total)
  }

  return ExpectedSpectrumSchema.parse({
    kind: 'expected-raman-spectrum',
    material_id: material.id,
    excitation_wavelength_nm: input.excitation_wavelength_nm,
    axis,
    scattered_wavelength_nm: scatteredWavelengths,
    relative_intensity: totalValues,
    components: {
      raman: ramanValues,
      fluorescence: fluorescenceValues,
      rayleigh: rayleighValues,
    },
    model_version: configuration.model_version,
  })
}
