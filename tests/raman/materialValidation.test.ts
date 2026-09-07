import { describe, expect, it } from 'vitest'
import {
  ExpectedSpectrumSchema,
  RamanMaterialSchema,
  RamanModelConfigurationSchema,
  RamanPeakSchema,
  SpectrumAxisSchema,
} from '../../src/core/raman'

const validPeak = {
  shift_cm_1: 520.7,
  relative_intensity: 1,
  width_cm_1: 1.5,
  assignment: 'Silicon reference peak',
} as const

const validMaterial = {
  id: 'material:test',
  name: 'Test material',
  fluorescence_level: 0,
  peaks: [validPeak],
} as const

describe('Raman material validation', () => {
  it('accepts a valid phenomenological material and freezes nested data', () => {
    const material = RamanMaterialSchema.parse(validMaterial)

    expect(material).toStrictEqual(validMaterial)
    expect(Object.isFrozen(material)).toBe(true)
    expect(Object.isFrozen(material.peaks)).toBe(true)
    expect(Object.isFrozen(material.peaks[0])).toBe(true)
  })

  it.each(['', ' material:test', 'material with spaces']) (
    'rejects the invalid material ID %j',
    (id) => {
      expect(() => RamanMaterialSchema.parse({ ...validMaterial, id })).toThrow()
    },
  )

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects non-finite peak shift %s',
    (shift_cm_1) => {
      expect(() =>
        RamanPeakSchema.parse({ ...validPeak, shift_cm_1 }),
      ).toThrow()
    },
  )

  it.each([
    -0.01,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ])('rejects invalid relative intensity %s', (relative_intensity) => {
    expect(() =>
      RamanPeakSchema.parse({ ...validPeak, relative_intensity }),
    ).toThrow()
  })

  it.each([
    0,
    -1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ])('rejects invalid width %s', (width_cm_1) => {
    expect(() => RamanPeakSchema.parse({ ...validPeak, width_cm_1 })).toThrow()
  })

  it.each([
    -0.01,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ])('rejects invalid fluorescence level %s', (fluorescence_level) => {
    expect(() =>
      RamanMaterialSchema.parse({ ...validMaterial, fluorescence_level }),
    ).toThrow()
  })

  it('rejects missing peaks, empty peaks, and unrecognized fields', () => {
    const withoutPeaks = {
      id: validMaterial.id,
      name: validMaterial.name,
      fluorescence_level: validMaterial.fluorescence_level,
    }

    expect(() => RamanMaterialSchema.parse(withoutPeaks)).toThrow()
    expect(() =>
      RamanMaterialSchema.parse({ ...validMaterial, peaks: [] }),
    ).toThrow()
    expect(() =>
      RamanMaterialSchema.parse({ ...validMaterial, invented: true }),
    ).toThrow()
    expect(() => RamanPeakSchema.parse({ ...validPeak, width: 1.5 })).toThrow()
  })
})

describe('Phase 3A spectrum contract validation', () => {
  const axis = {
    kind: 'raman-shift',
    unit: 'cm^-1',
    values_cm_1: [-100, 0, 520.7],
  } as const

  it('accepts explicit increasing Raman-shift axis data', () => {
    expect(SpectrumAxisSchema.parse(axis)).toStrictEqual(axis)
  })

  it.each([
    { values_cm_1: [-100, -100, 520.7] },
    { values_cm_1: [0, -1] },
    { values_cm_1: [0, Number.NaN] },
  ])('rejects an invalid spectrum axis %#', ({ values_cm_1 }) => {
    expect(() => SpectrumAxisSchema.parse({ ...axis, values_cm_1 })).toThrow()
  })

  it('keeps expected Raman output semantically distinct and length-matched', () => {
    const expected = ExpectedSpectrumSchema.parse({
      kind: 'expected-raman-spectrum',
      material_id: 'material:silicon',
      excitation_wavelength_nm: 532,
      axis,
      scattered_wavelength_nm: [529.2, 532, 547.2],
      relative_intensity: [0, 0.1, 1],
      components: {
        raman: [0, 0.1, 1],
        fluorescence: [0, 0, 0],
        rayleigh: [0, 0, 0],
      },
      model_version: 'raman-spectrum-v1',
    })

    expect(expected.kind).toBe('expected-raman-spectrum')
    expect(() =>
      ExpectedSpectrumSchema.parse({
        ...expected,
        relative_intensity: [0, 1],
      }),
    ).toThrow(/equal length/)
  })

  it('validates only the Phase 3A Raman model identity and material reference', () => {
    expect(
      RamanModelConfigurationSchema.parse({
        model_version: 'raman-v1',
        material_id: 'material:silicon',
      }),
    ).toStrictEqual({
      model_version: 'raman-v1',
      material_id: 'material:silicon',
    })
    expect(() =>
      RamanModelConfigurationSchema.parse({
        model_version: 'raman-v2',
        material_id: 'material:silicon',
      }),
    ).toThrow()
  })
})
