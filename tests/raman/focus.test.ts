import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SIMPLIFIED_FOCUS_CONFIGURATION,
  SIMPLIFIED_FOCUS_MODEL_PARAMETERS,
  calculateSimplifiedFocusEfficiency,
} from '../../src/core/raman'

describe('simplified first-order focus efficiency', () => {
  it('uses an explicit provisional millimetre parameter', () => {
    expect(SIMPLIFIED_FOCUS_MODEL_PARAMETERS).toStrictEqual({
      model_version: 'simplified-focus-v1',
      provenance:
        'reference/raman_sandbox.html ZR scale: 1.5 reference grid pitches at 25 mm per pitch',
      z_r_mm: 37.5,
      interpretation: 'provisional first-order defocus scale',
    })
    expect(DEFAULT_SIMPLIFIED_FOCUS_CONFIGURATION.z_r_mm).toBe(37.5)
    expect(JSON.stringify(DEFAULT_SIMPLIFIED_FOCUS_CONFIGURATION)).not.toMatch(
      /pixel|_px/i,
    )
  })

  it('is maximal at focus, symmetric, and continuously decreases with |dz|', () => {
    const zR = DEFAULT_SIMPLIFIED_FOCUS_CONFIGURATION.z_r_mm
    const efficiencies = [0, 5, 10, 20, 37.5, 75].map((defocus) =>
      calculateSimplifiedFocusEfficiency(defocus, zR),
    )

    expect(efficiencies[0]).toBe(1)
    for (let index = 1; index < efficiencies.length; index += 1) {
      expect(efficiencies[index]).toBeLessThan(efficiencies[index - 1]!)
    }
    expect(calculateSimplifiedFocusEfficiency(37.5, zR)).toBe(0.5)
    expect(calculateSimplifiedFocusEfficiency(-20, zR)).toBe(
      calculateSimplifiedFocusEfficiency(20, zR),
    )
  })

  it('rejects non-finite defocus and invalid zR', () => {
    expect(() =>
      calculateSimplifiedFocusEfficiency(Number.NaN, 37.5),
    ).toThrow(/finite/)
    expect(() => calculateSimplifiedFocusEfficiency(0, 0)).toThrow()
    expect(() => calculateSimplifiedFocusEfficiency(0, -1)).toThrow()
  })
})
