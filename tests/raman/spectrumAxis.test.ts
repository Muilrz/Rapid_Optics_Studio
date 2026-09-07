import { describe, expect, it } from 'vitest'
import {
  BUILT_IN_RAMAN_MATERIALS,
  RAMAN_SANDBOX_EMPIRICAL_PARAMETERS,
  createAutoSpectrumAxis,
  createCustomSpectrumAxis,
  createSpectrumAxis,
} from '../../src/core/raman'

describe('Raman spectrum axis generation', () => {
  it.each([
    ['material:silicon', -100, 1163],
    ['material:polystyrene', -100, 3254],
    ['material:calcite', -100, 1636],
  ] as const)(
    'creates the dynamic auto window for %s',
    (materialId, expectedMinimum, expectedMaximum) => {
      const material = BUILT_IN_RAMAN_MATERIALS.find(
        ({ id }) => id === materialId,
      )!
      const axis = createAutoSpectrumAxis(material)

      expect(axis.values_cm_1).toHaveLength(
        RAMAN_SANDBOX_EMPIRICAL_PARAMETERS.auto_axis_sample_count,
      )
      expect(axis.values_cm_1[0]).toBe(expectedMinimum)
      expect(axis.values_cm_1.at(-1)).toBe(expectedMaximum)
    },
  )

  it('retains every high-shift Polystyrene peak instead of stopping at 1900', () => {
    const polystyrene = BUILT_IN_RAMAN_MATERIALS.find(
      ({ id }) => id === 'material:polystyrene',
    )!
    const axis = createSpectrumAxis(polystyrene, { mode: 'auto' })
    const minimum = axis.values_cm_1[0]!
    const maximum = axis.values_cm_1.at(-1)!

    expect(maximum).toBeGreaterThan(3054)
    expect(maximum).not.toBe(1900)
    for (const shift of [2852, 2904, 3054]) {
      expect(shift).toBeGreaterThanOrEqual(minimum)
      expect(shift).toBeLessThanOrEqual(maximum)
    }
  })

  it('creates an explicit evenly spaced custom window', () => {
    const axis = createCustomSpectrumAxis({
      mode: 'custom',
      minimum_shift_cm_1: -50,
      maximum_shift_cm_1: 4000,
      sample_count: 5,
    })

    expect(axis.values_cm_1).toEqual([-50, 962.5, 1975, 2987.5, 4000])
  })

  it('rejects invalid custom windows and sample counts', () => {
    expect(() =>
      createCustomSpectrumAxis({
        mode: 'custom',
        minimum_shift_cm_1: 100,
        maximum_shift_cm_1: 100,
        sample_count: 10,
      }),
    ).toThrow(/maximum shift/)
    expect(() =>
      createCustomSpectrumAxis({
        mode: 'custom',
        minimum_shift_cm_1: 0,
        maximum_shift_cm_1: 100,
        sample_count: 1,
      }),
    ).toThrow()
  })
})
