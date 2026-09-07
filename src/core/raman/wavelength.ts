import { NanometersSchema } from '../optics'
import { WAVENUMBER_NM_CM_CONVERSION } from './modelParameters'

const assertFinite = (value: number, label: string): void => {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be finite.`)
  }
}

const assertPositiveFinite = (value: number, label: string): void => {
  assertFinite(value, label)
  if (value <= 0) {
    throw new RangeError(`${label} must be positive.`)
  }
}

/** Converts Raman shift to scattered wavelength using vacuum wavenumbers. */
export const ramanShiftToScatteredWavelengthNm = (
  excitationWavelength_nm: number,
  shift_cm_1: number,
): number => {
  const excitation = NanometersSchema.parse(excitationWavelength_nm)
  assertFinite(shift_cm_1, 'Raman shift')

  const scatteredWavenumberPerNm =
    1 / excitation - shift_cm_1 / WAVENUMBER_NM_CM_CONVERSION
  if (
    !Number.isFinite(scatteredWavenumberPerNm) ||
    scatteredWavenumberPerNm <= 0
  ) {
    throw new RangeError(
      'Raman shift must leave a finite positive scattered wavenumber.',
    )
  }

  const wavelength_nm = 1 / scatteredWavenumberPerNm
  assertPositiveFinite(wavelength_nm, 'Scattered wavelength')
  return wavelength_nm
}

/** Converts a positive scattered wavelength back to Raman shift. */
export const scatteredWavelengthToRamanShiftCm1 = (
  excitationWavelength_nm: number,
  scatteredWavelength_nm: number,
): number => {
  const excitation = NanometersSchema.parse(excitationWavelength_nm)
  assertPositiveFinite(scatteredWavelength_nm, 'Scattered wavelength')

  const shift_cm_1 =
    WAVENUMBER_NM_CM_CONVERSION *
    (1 / excitation - 1 / scatteredWavelength_nm)
  assertFinite(shift_cm_1, 'Raman shift')
  return shift_cm_1
}
