import { describe, expect, it } from 'vitest'
import {
  BUILT_IN_RAMAN_MATERIALS,
  DEFAULT_RAMAN_SPECTRUM_SYNTHESIS_CONFIGURATION,
  RamanMaterialSchema,
  createAutoSpectrumAxis,
  createCustomSpectrumAxis,
  synthesizeExpectedRamanSpectrum,
} from '../../src/core/raman'

const noRayleighConfiguration = {
  ...DEFAULT_RAMAN_SPECTRUM_SYNTHESIS_CONFIGURATION,
  rayleigh_leakage_scale: 0,
} as const

const indexOfMaximum = (values: readonly number[]): number =>
  values.reduce(
    (maximumIndex, value, index) =>
      value > values[maximumIndex]! ? index : maximumIndex,
    0,
  )

describe('deterministic Raman spectrum synthesis', () => {
  it.each(BUILT_IN_RAMAN_MATERIALS)(
    'synthesizes every $name reference peak at its Raman shift',
    (material) => {
      for (const [peakIndex, peak] of material.peaks.entries()) {
        const isolatedMaterial = RamanMaterialSchema.parse({
          ...material,
          id: `material:test:${material.id.split(':')[1]}:${peakIndex}`,
          fluorescence_level: 0,
          peaks: [peak],
        })
        const axis = createCustomSpectrumAxis({
          mode: 'custom',
          minimum_shift_cm_1: peak.shift_cm_1 - 20,
          maximum_shift_cm_1: peak.shift_cm_1 + 20,
          sample_count: 161,
        })
        const spectrum = synthesizeExpectedRamanSpectrum({
          material: isolatedMaterial,
          excitation_wavelength_nm: 532,
          axis,
          configuration: noRayleighConfiguration,
        })
        const maximumIndex = indexOfMaximum(spectrum.components.raman)
        const synthesizedPeakShift = axis.values_cm_1[maximumIndex]!

        expect(Math.abs(synthesizedPeakShift - peak.shift_cm_1)).toBeLessThanOrEqual(
          0.5,
        )
        expect(spectrum.components.raman[maximumIndex]).toBeGreaterThan(0)
      }
    },
  )

  it.each([532, 633, 785])(
    'keeps Polystyrene Raman-shift identity while mapping %s nm wavelengths',
    (excitation_wavelength_nm) => {
      const material = BUILT_IN_RAMAN_MATERIALS.find(
        ({ id }) => id === 'material:polystyrene',
      )!
      const axis = createAutoSpectrumAxis(material)
      const spectrum = synthesizeExpectedRamanSpectrum({
        material,
        excitation_wavelength_nm,
        axis,
        configuration: noRayleighConfiguration,
      })

      expect(spectrum.axis).toStrictEqual(axis)
      expect(spectrum.material_id).toBe('material:polystyrene')
      expect(spectrum.scattered_wavelength_nm.at(-1)).toBeGreaterThan(
        excitation_wavelength_nm,
      )
    },
  )

  it('applies configured instrument broadening during spectrum synthesis', () => {
    const silicon = BUILT_IN_RAMAN_MATERIALS.find(
      ({ id }) => id === 'material:silicon',
    )!
    const material = RamanMaterialSchema.parse({
      ...silicon,
      id: 'material:test:broadening',
      fluorescence_level: 0,
      peaks: [silicon.peaks[1]],
    })
    const axis = createCustomSpectrumAxis({
      mode: 'custom',
      minimum_shift_cm_1: 480.7,
      maximum_shift_cm_1: 560.7,
      sample_count: 321,
    })
    const narrow = synthesizeExpectedRamanSpectrum({
      material,
      excitation_wavelength_nm: 532,
      axis,
      configuration: {
        ...noRayleighConfiguration,
        broadening: {
          model: 'quadrature-half-width',
          instrument_half_width_cm_1: 0,
        },
      },
    })
    const broadened = synthesizeExpectedRamanSpectrum({
      material,
      excitation_wavelength_nm: 532,
      axis,
      configuration: {
        ...noRayleighConfiguration,
        broadening: {
          model: 'quadrature-half-width',
          instrument_half_width_cm_1: 12,
        },
      },
    })
    const wingIndex = 80

    expect(axis.values_cm_1[wingIndex]).toBeCloseTo(500.7, 12)
    expect(broadened.components.raman[wingIndex]).toBeGreaterThan(
      narrow.components.raman[wingIndex]!,
    )
  })

  it('changes wavelength mapping across lasers without changing the axis', () => {
    const material = BUILT_IN_RAMAN_MATERIALS[0]!
    const axis = createAutoSpectrumAxis(material, 300)
    const spectra = [532, 633, 785].map((excitation_wavelength_nm) =>
      synthesizeExpectedRamanSpectrum({
        material,
        excitation_wavelength_nm,
        axis,
        configuration: noRayleighConfiguration,
      }),
    )

    expect(spectra[0]!.axis).toStrictEqual(spectra[1]!.axis)
    expect(spectra[1]!.axis).toStrictEqual(spectra[2]!.axis)
    expect(spectra[0]!.scattered_wavelength_nm).not.toEqual(
      spectra[1]!.scattered_wavelength_nm,
    )
    expect(spectra[1]!.scattered_wavelength_nm).not.toEqual(
      spectra[2]!.scattered_wavelength_nm,
    )
  })

  it('produces continuous fluorescence and zero fluorescence for Silicon', () => {
    const calcite = BUILT_IN_RAMAN_MATERIALS.find(
      ({ id }) => id === 'material:calcite',
    )!
    const silicon = BUILT_IN_RAMAN_MATERIALS.find(
      ({ id }) => id === 'material:silicon',
    )!
    const axis = createCustomSpectrumAxis({
      mode: 'custom',
      minimum_shift_cm_1: 895,
      maximum_shift_cm_1: 905,
      sample_count: 101,
    })
    const calciteSpectrum = synthesizeExpectedRamanSpectrum({
      material: calcite,
      excitation_wavelength_nm: 532,
      axis,
      configuration: noRayleighConfiguration,
    })
    const siliconSpectrum = synthesizeExpectedRamanSpectrum({
      material: silicon,
      excitation_wavelength_nm: 532,
      axis,
      configuration: noRayleighConfiguration,
    })

    expect(calciteSpectrum.components.fluorescence.every((value) => value > 0)).toBe(
      true,
    )
    expect(indexOfMaximum(calciteSpectrum.components.fluorescence)).toBe(50)
    expect(
      calciteSpectrum.components.fluorescence.every((value, index, values) =>
        index === 0 ? true : Math.abs(value - values[index - 1]!) < 0.001,
      ),
    ).toBe(true)
    expect(siliconSpectrum.components.fluorescence.every((value) => value === 0)).toBe(
      true,
    )
  })

  it('places the synthesized Rayleigh maximum at zero Raman shift', () => {
    const material = BUILT_IN_RAMAN_MATERIALS[0]!
    const axis = createCustomSpectrumAxis({
      mode: 'custom',
      minimum_shift_cm_1: -20,
      maximum_shift_cm_1: 20,
      sample_count: 41,
    })
    const spectrum = synthesizeExpectedRamanSpectrum({
      material,
      excitation_wavelength_nm: 532,
      axis,
      configuration: {
        ...noRayleighConfiguration,
        effective_excitation_scale: 0,
        rayleigh_leakage_scale: 0.001,
      },
    })
    const maximumIndex = indexOfMaximum(spectrum.components.rayleigh)

    expect(axis.values_cm_1[maximumIndex]).toBe(0)
    expect(spectrum.components.rayleigh[0]).toBe(
      spectrum.components.rayleigh.at(-1),
    )
  })

  it.each(BUILT_IN_RAMAN_MATERIALS)(
    'emits only finite non-negative values for $name across all laser presets',
    (material) => {
      const axis = createAutoSpectrumAxis(material, 500)
      for (const excitation_wavelength_nm of [532, 633, 785]) {
        const spectrum = synthesizeExpectedRamanSpectrum({
          material,
          excitation_wavelength_nm,
          axis,
          configuration: {
            ...noRayleighConfiguration,
            rayleigh_leakage_scale: 0.000001,
          },
        })
        const allValues = [
          ...spectrum.scattered_wavelength_nm,
          ...spectrum.relative_intensity,
          ...spectrum.components.raman,
          ...spectrum.components.fluorescence,
          ...spectrum.components.rayleigh,
        ]

        expect(allValues.every(Number.isFinite)).toBe(true)
        expect(allValues.every((value) => value >= 0)).toBe(true)
      }
    },
  )

  it('returns deeply immutable identical output for identical input', () => {
    const material = BUILT_IN_RAMAN_MATERIALS[0]!
    const input = {
      material,
      excitation_wavelength_nm: 532,
      axis: createAutoSpectrumAxis(material, 200),
      configuration: noRayleighConfiguration,
    } as const
    const first = synthesizeExpectedRamanSpectrum(input)
    const second = synthesizeExpectedRamanSpectrum(input)

    expect(first).toStrictEqual(second)
    expect(Object.isFrozen(first)).toBe(true)
    expect(Object.isFrozen(first.relative_intensity)).toBe(true)
    expect(Object.isFrozen(first.components)).toBe(true)
    expect(Object.isFrozen(first.components.raman)).toBe(true)
  })
})
