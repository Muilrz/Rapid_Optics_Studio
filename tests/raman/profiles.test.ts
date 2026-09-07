import { describe, expect, it } from 'vitest'
import {
  RAMAN_SANDBOX_EMPIRICAL_PARAMETERS,
  combineHalfWidthsInQuadrature,
  excitationLineEdgeResponse,
  fluorescenceBackground,
  fluorescenceExcitationFactor,
  lorentzianProfile,
  rayleighContribution,
  wavelengthDependentRamanScaling,
} from '../../src/core/raman'

describe('versioned Raman Sandbox parameters', () => {
  it('makes every inherited Phase 3B empirical constant explicit', () => {
    expect(RAMAN_SANDBOX_EMPIRICAL_PARAMETERS).toStrictEqual({
      model_version: 'raman-spectrum-v1',
      provenance:
        'reference/raman_sandbox.html computeSpectrum and drawBigSpec',
      raman_relative_scale: 1,
      instrument_half_width_cm_1: 6,
      edge_cutoff_offset_nm: 1.5,
      edge_transition_width_nm: 0.35,
      fluorescence_excitation_green_max_nm: 540,
      fluorescence_excitation_red_max_nm: 650,
      fluorescence_green_factor: 1,
      fluorescence_red_factor: 0.4,
      fluorescence_nir_factor: 0.1,
      fluorescence_center_cm_1: 900,
      fluorescence_width_cm_1: 1400,
      fluorescence_relative_scale: 2,
      rayleigh_center_cm_1: 0,
      rayleigh_half_width_cm_1: 5,
      rayleigh_reference_intensity: 1_000_000,
      auto_axis_minimum_shift_cm_1: -100,
      auto_axis_peak_padding_cm_1: 200,
      auto_axis_sample_count: 1400,
    })
    expect(Object.isFrozen(RAMAN_SANDBOX_EMPIRICAL_PARAMETERS)).toBe(true)
  })
})

describe('deterministic Raman profiles', () => {
  it('produces a normalized symmetric Lorentzian with half-height at HWHM', () => {
    expect(lorentzianProfile(1000, 1000, 8)).toBe(1)
    expect(lorentzianProfile(992, 1000, 8)).toBe(0.5)
    expect(lorentzianProfile(1008, 1000, 8)).toBe(0.5)
    expect(lorentzianProfile(984, 1000, 8)).toBe(
      lorentzianProfile(1016, 1000, 8),
    )
  })

  it('combines intrinsic and configured half-width in quadrature', () => {
    expect(combineHalfWidthsInQuadrature(8, 6)).toBe(10)
    expect(combineHalfWidthsInQuadrature(1.5, 6)).toBeCloseTo(
      Math.sqrt(38.25),
      14,
    )
  })

  it('rejects invalid profile and broadening inputs', () => {
    expect(() => lorentzianProfile(0, 0, 0)).toThrow()
    expect(() => lorentzianProfile(Number.NaN, 0, 1)).toThrow()
    expect(() => combineHalfWidthsInQuadrature(1, -1)).toThrow()
  })

  it('applies the current V1 wavelength-dependent fourth-power scaling', () => {
    expect(wavelengthDependentRamanScaling(532, 532)).toBe(1)
    expect(wavelengthDependentRamanScaling(532, 547.1569253055512)).toBeCloseTo(
      (532 / 547.1569253055512) ** 4,
      14,
    )
    expect(wavelengthDependentRamanScaling(532, 600)).toBeLessThan(1)
  })

  it('reproduces the stable excitation-line edge sigmoid', () => {
    expect(excitationLineEdgeResponse(532, 533.5)).toBe(0.5)
    expect(excitationLineEdgeResponse(532, 532)).toBeLessThan(0.02)
    expect(excitationLineEdgeResponse(532, 540)).toBeGreaterThan(0.999)
    expect(excitationLineEdgeResponse(532, 100_000)).toBe(1)
  })

  it('preserves the excitation-dependent fluorescence factors', () => {
    expect(fluorescenceExcitationFactor(532)).toBe(1)
    expect(fluorescenceExcitationFactor(540)).toBe(1)
    expect(fluorescenceExcitationFactor(633)).toBe(0.4)
    expect(fluorescenceExcitationFactor(650)).toBe(0.4)
    expect(fluorescenceExcitationFactor(785)).toBe(0.1)
  })

  it('produces a continuous broad fluorescence background centered at 900 cm^-1', () => {
    const center = fluorescenceBackground(900, 532, 0.1, 1)
    const left = fluorescenceBackground(899.9, 532, 0.1, 1)
    const right = fluorescenceBackground(900.1, 532, 0.1, 1)

    expect(center).toBeCloseTo(0.2, 14)
    expect(left).toBeCloseTo(right, 14)
    expect(left).toBeLessThan(center)
    expect(fluorescenceBackground(900, 633, 0.1, 1)).toBeCloseTo(0.08, 14)
    expect(fluorescenceBackground(900, 785, 0.1, 1)).toBeCloseTo(0.02, 14)
  })

  it('centers the Rayleigh Lorentzian at zero Raman shift', () => {
    expect(rayleighContribution(0, 0.001)).toBe(1000)
    expect(rayleighContribution(-5, 0.001)).toBe(500)
    expect(rayleighContribution(5, 0.001)).toBe(500)
    expect(rayleighContribution(20, 0.001)).toBeLessThan(100)
  })
})
