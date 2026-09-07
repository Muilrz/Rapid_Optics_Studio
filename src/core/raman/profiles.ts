import { NanometersSchema } from '../optics'
import { RAMAN_SANDBOX_EMPIRICAL_PARAMETERS } from './modelParameters'

const assertFinite = (value: number, label: string): void => {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be finite.`)
  }
}

const assertNonNegativeFinite = (value: number, label: string): void => {
  assertFinite(value, label)
  if (value < 0) {
    throw new RangeError(`${label} must not be negative.`)
  }
}

const assertPositiveFinite = (value: number, label: string): void => {
  assertFinite(value, label)
  if (value <= 0) {
    throw new RangeError(`${label} must be positive.`)
  }
}

const assertValidContribution = (value: number, label: string): number => {
  assertNonNegativeFinite(value, label)
  return value
}

/** Unit-height Lorentzian parameterized by half-width at half maximum. */
export const lorentzianProfile = (
  position_cm_1: number,
  center_cm_1: number,
  halfWidth_cm_1: number,
): number => {
  assertFinite(position_cm_1, 'Lorentzian position')
  assertFinite(center_cm_1, 'Lorentzian center')
  assertPositiveFinite(halfWidth_cm_1, 'Lorentzian half-width')

  const normalizedOffset =
    (position_cm_1 - center_cm_1) / halfWidth_cm_1
  if (!Number.isFinite(normalizedOffset)) return 0
  return 1 / (1 + normalizedOffset * normalizedOffset)
}

/** Sandbox-compatible quadrature combination of two Lorentzian half-widths. */
export const combineHalfWidthsInQuadrature = (
  intrinsicHalfWidth_cm_1: number,
  instrumentHalfWidth_cm_1: number,
): number => {
  assertPositiveFinite(intrinsicHalfWidth_cm_1, 'Intrinsic half-width')
  assertNonNegativeFinite(instrumentHalfWidth_cm_1, 'Instrument half-width')
  const combined = Math.hypot(
    intrinsicHalfWidth_cm_1,
    instrumentHalfWidth_cm_1,
  )
  assertPositiveFinite(combined, 'Combined half-width')
  return combined
}

/** Current V1 simplified scattered-frequency-to-the-fourth relative scaling. */
export const wavelengthDependentRamanScaling = (
  excitationWavelength_nm: number,
  scatteredWavelength_nm: number,
): number => {
  const excitation = NanometersSchema.parse(excitationWavelength_nm)
  assertPositiveFinite(scatteredWavelength_nm, 'Scattered wavelength')
  const scaling = (excitation / scatteredWavelength_nm) ** 4
  return assertValidContribution(scaling, 'Wavelength-dependent Raman scaling')
}

/** Stable form of the Sandbox excitation-line edge sigmoid. */
export const excitationLineEdgeResponse = (
  excitationWavelength_nm: number,
  scatteredWavelength_nm: number,
): number => {
  const excitation = NanometersSchema.parse(excitationWavelength_nm)
  assertPositiveFinite(scatteredWavelength_nm, 'Scattered wavelength')
  const parameters = RAMAN_SANDBOX_EMPIRICAL_PARAMETERS
  const normalized =
    (scatteredWavelength_nm -
      (excitation + parameters.edge_cutoff_offset_nm)) /
    parameters.edge_transition_width_nm

  if (normalized >= 0) {
    return 1 / (1 + Math.exp(-normalized))
  }
  const exponential = Math.exp(normalized)
  return exponential / (1 + exponential)
}

export const fluorescenceExcitationFactor = (
  excitationWavelength_nm: number,
): number => {
  const excitation = NanometersSchema.parse(excitationWavelength_nm)
  const parameters = RAMAN_SANDBOX_EMPIRICAL_PARAMETERS
  if (excitation <= parameters.fluorescence_excitation_green_max_nm) {
    return parameters.fluorescence_green_factor
  }
  if (excitation <= parameters.fluorescence_excitation_red_max_nm) {
    return parameters.fluorescence_red_factor
  }
  return parameters.fluorescence_nir_factor
}

/** Deterministic broad fluorescence contribution from the Sandbox model. */
export const fluorescenceBackground = (
  shift_cm_1: number,
  excitationWavelength_nm: number,
  materialFluorescenceLevel: number,
  effectiveExcitationScale: number,
): number => {
  assertFinite(shift_cm_1, 'Fluorescence Raman shift')
  assertNonNegativeFinite(
    materialFluorescenceLevel,
    'Material fluorescence level',
  )
  assertNonNegativeFinite(
    effectiveExcitationScale,
    'Effective excitation scale',
  )
  const parameters = RAMAN_SANDBOX_EMPIRICAL_PARAMETERS
  const normalized =
    (shift_cm_1 - parameters.fluorescence_center_cm_1) /
    parameters.fluorescence_width_cm_1
  const contribution =
    effectiveExcitationScale *
    materialFluorescenceLevel *
    fluorescenceExcitationFactor(excitationWavelength_nm) *
    Math.exp(-(normalized * normalized)) *
    parameters.fluorescence_relative_scale
  return assertValidContribution(contribution, 'Fluorescence contribution')
}

/** Deterministic Rayleigh line centered on zero Raman shift. */
export const rayleighContribution = (
  shift_cm_1: number,
  rayleighLeakageScale: number,
): number => {
  assertNonNegativeFinite(rayleighLeakageScale, 'Rayleigh leakage scale')
  const parameters = RAMAN_SANDBOX_EMPIRICAL_PARAMETERS
  const contribution =
    parameters.rayleigh_reference_intensity *
    rayleighLeakageScale *
    lorentzianProfile(
      shift_cm_1,
      parameters.rayleigh_center_cm_1,
      parameters.rayleigh_half_width_cm_1,
    )
  return assertValidContribution(contribution, 'Rayleigh contribution')
}
