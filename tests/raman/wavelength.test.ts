import { describe, expect, it } from 'vitest'
import {
  RAMAN_SHIFT_ROUND_TRIP_TOLERANCE_CM_1,
  ramanShiftToScatteredWavelengthNm,
  scatteredWavelengthToRamanShiftCm1,
} from '../../src/core/raman'

describe('Raman shift and scattered wavelength conversion', () => {
  it('maps known Stokes shifts to the reference scattered wavelengths', () => {
    expect(ramanShiftToScatteredWavelengthNm(532, 0)).toBe(532)
    expect(ramanShiftToScatteredWavelengthNm(532, 520.7)).toBeCloseTo(
      547.1569253055512,
      12,
    )
    expect(ramanShiftToScatteredWavelengthNm(633, 1001)).toBeCloseTo(
      675.8223332483129,
      12,
    )
    expect(ramanShiftToScatteredWavelengthNm(785, 3054)).toBeCloseTo(
      1032.5401408200605,
      12,
    )
  })

  it('maps anti-Stokes shifts to wavelengths below excitation', () => {
    expect(ramanShiftToScatteredWavelengthNm(532, -100)).toBeLessThan(532)
  })

  it.each([532, 633, 785])(
    'round-trips all relevant material shifts at %s nm within tolerance',
    (excitationWavelength_nm) => {
      for (const shift_cm_1 of [-100, 0, 155, 520.7, 1001, 3054]) {
        const scattered = ramanShiftToScatteredWavelengthNm(
          excitationWavelength_nm,
          shift_cm_1,
        )
        const roundTrip = scatteredWavelengthToRamanShiftCm1(
          excitationWavelength_nm,
          scattered,
        )
        expect(Math.abs(roundTrip - shift_cm_1)).toBeLessThanOrEqual(
          RAMAN_SHIFT_ROUND_TRIP_TOLERANCE_CM_1,
        )
      }
    },
  )

  it('rejects non-finite inputs and non-positive scattered wavenumbers', () => {
    const zeroWavenumberShift = 10_000_000 / 532

    expect(() =>
      ramanShiftToScatteredWavelengthNm(532, Number.NaN),
    ).toThrow()
    expect(() =>
      ramanShiftToScatteredWavelengthNm(532, zeroWavenumberShift),
    ).toThrow(/positive scattered wavenumber/)
    expect(() =>
      ramanShiftToScatteredWavelengthNm(532, zeroWavenumberShift + 1),
    ).toThrow(/positive scattered wavenumber/)
    expect(() =>
      scatteredWavelengthToRamanShiftCm1(532, 0),
    ).toThrow(/positive/)
    expect(() =>
      scatteredWavelengthToRamanShiftCm1(532, Number.POSITIVE_INFINITY),
    ).toThrow(/finite/)
  })
})
