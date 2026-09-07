import { describe, expect, it, vi } from 'vitest'
import {
  CCD_NOISE_MODEL_VERSION,
  DEFAULT_VIRTUAL_CCD_CONFIGURATION,
  EXPECTED_CCD_SPECTRUM_MODEL_VERSION,
  ExpectedCcdSpectrumSchema,
  MULBERRY32_RNG_PARAMETERS,
  PREVIEW_EXPOSURE_MODEL_VERSION,
  RAMAN_SANDBOX_NOISE_PARAMETERS,
  VIRTUAL_SPECTROMETER_MODEL_VERSION,
  createMulberry32RandomNumberGenerator,
  simulateCcdPreviewExposure,
  simulateSeededCcdPreviewExposure,
  type ExpectedCcdSpectrum,
  type RandomNumberGenerator,
} from '../../src/core/acquisition'

interface ExpectedFixtureOptions {
  readonly length?: number
  readonly signal_counts?: number
  readonly dark_counts?: number
  readonly read_noise_rms_counts?: number
  readonly full_well_counts?: number
}

const createExpectedFixture = (
  options: ExpectedFixtureOptions = {},
): ExpectedCcdSpectrum => {
  const length = options.length ?? 4
  const signal = options.signal_counts ?? 100
  const dark = options.dark_counts ?? 0
  const fullWell = options.full_well_counts ?? 1_000_000
  const unclipped = signal + dark
  const expected = Math.min(unclipped, fullWell)
  const saturated = unclipped >= fullWell
  const values = Array.from({ length }, (_, index) => index)

  return ExpectedCcdSpectrumSchema.parse({
    kind: 'expected-ccd-spectrum',
    model_version: EXPECTED_CCD_SPECTRUM_MODEL_VERSION,
    source_spectrum_kind: 'expected-raman-spectrum',
    source_raman_model_version: 'raman-spectrum-v1',
    material_id: 'material:silicon',
    axis: {
      kind: 'raman-shift',
      unit: 'cm^-1',
      values_cm_1: values,
    },
    scattered_wavelength_nm: values.map((value) => 532 + value / 100_000),
    quantum_efficiency: values.map(() => 0.8),
    signal_counts: values.map(() => signal),
    dark_counts: values.map(() => dark),
    unclipped_expected_counts: values.map(() => unclipped),
    expected_counts: values.map(() => expected),
    saturated: values.map(() => saturated),
    saturated_bin_count: saturated ? length : 0,
    spectrometer: {
      model_version: VIRTUAL_SPECTROMETER_MODEL_VERSION,
      spectrometer_component_id: 'component:spectrometer',
      optical_throughput: 1,
      grating_throughput: 0.7,
      instrument_half_width_cm_1: 6,
      incident_photon_scale_per_relative_intensity_second: 50,
    },
    detector: {
      ...DEFAULT_VIRTUAL_CCD_CONFIGURATION,
      full_well_counts: fullWell,
      read_noise_rms_counts: options.read_noise_rms_counts ?? 3,
    },
  })
}

const average = (values: readonly number[]): number =>
  values.reduce((sum, value) => sum + value, 0) / values.length

const variance = (values: readonly number[]): number => {
  const mean = average(values)
  return (
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    values.length
  )
}

describe('seeded RNG and explicit Sandbox noise parameters', () => {
  it('locks the random approximation and seeded algorithm semantics', () => {
    expect(RAMAN_SANDBOX_NOISE_PARAMETERS).toStrictEqual({
      provenance: 'reference/raman_sandbox.html randn and withNoise',
      model_version: CCD_NOISE_MODEL_VERSION,
      counting_noise_model:
        'Gaussian approximation to combined signal-shot and dark expectation',
      counting_variance_floor_counts: 1,
      normal_sampler: 'Box-Muller cosine branch with two uniform draws',
      read_noise_model: 'independent zero-mean Gaussian in output counts',
      output_bounds: 'clip to zero and detector full-well counts',
      interpretation:
        'simplified stochastic preview model, not exact Poisson CCD',
    })
    expect(MULBERRY32_RNG_PARAMETERS).toStrictEqual({
      algorithm: 'mulberry32-v1',
      state_increment_uint32: 0x6d2b_79f5,
      output_divisor: 0x1_0000_0000,
      interpretation: 'deterministic seeded 32-bit preview RNG',
    })
  })

  it('produces a stable seeded uniform sequence without global randomness', () => {
    const globalRandom = vi
      .spyOn(Math, 'random')
      .mockImplementation(() => {
        throw new Error('Global Math.random must not be used.')
      })
    try {
      const first = createMulberry32RandomNumberGenerator(12345)
      const second = createMulberry32RandomNumberGenerator(12345)
      const firstValues = Array.from({ length: 5 }, () =>
        first.nextUnitInterval(),
      )
      const secondValues = Array.from({ length: 5 }, () =>
        second.nextUnitInterval(),
      )

      expect(firstValues).toStrictEqual(secondValues)
      expect(firstValues).toStrictEqual([
        0.9797282677609473,
        0.3067522644996643,
        0.484205421525985,
        0.817934412509203,
        0.5094283693470061,
      ])
    } finally {
      globalRandom.mockRestore()
    }
  })

  it('accepts an injected RNG and rejects samples outside [0, 1)', () => {
    const sequence = [0.25, 0.5, 0.75, 0.125]
    let index = 0
    const injected: RandomNumberGenerator = {
      provenance: { algorithm: 'test-sequence', seed_uint32: null },
      nextUnitInterval: () => sequence[index++ % sequence.length]!,
    }
    const exposure = simulateCcdPreviewExposure(
      createExpectedFixture({ length: 2 }),
      injected,
    )

    expect(exposure.rng).toStrictEqual({
      algorithm: 'test-sequence',
      seed_uint32: null,
    })
    expect(() =>
      simulateCcdPreviewExposure(createExpectedFixture({ length: 2 }), {
        provenance: { algorithm: 'invalid-test-rng', seed_uint32: null },
        nextUnitInterval: () => 1,
      }),
    ).toThrow(/\[0, 1\)/)
  })
})

describe('single simulated CCD preview exposure', () => {
  it('uses a distinct immutable preview semantic contract', () => {
    const exposure = simulateSeededCcdPreviewExposure(
      createExpectedFixture(),
      42,
    )

    expect(exposure).toMatchObject({
      kind: 'simulated-ccd-preview-exposure',
      model_version: PREVIEW_EXPOSURE_MODEL_VERSION,
      noise_model_version: CCD_NOISE_MODEL_VERSION,
      source_expected_spectrum_model_version:
        EXPECTED_CCD_SPECTRUM_MODEL_VERSION,
      rng: { algorithm: 'mulberry32-v1', seed_uint32: 42 },
    })
    expect(JSON.stringify(exposure)).not.toMatch(
      /acquisition.run|average|processed.spectrum/i,
    )
    expect(Object.isFrozen(exposure)).toBe(true)
    expect(Object.isFrozen(exposure.counts)).toBe(true)
    expect(Object.isFrozen(exposure.detector_bounds)).toBe(true)
  })

  it('returns identical exposure data for the same input and seed', () => {
    const expected = createExpectedFixture()
    const first = simulateSeededCcdPreviewExposure(expected, 987654321)
    const second = simulateSeededCcdPreviewExposure(expected, 987654321)

    expect(first).toStrictEqual(second)
  })

  it('returns different realizations for different seeds', () => {
    const expected = createExpectedFixture()
    const first = simulateSeededCcdPreviewExposure(expected, 1)
    const second = simulateSeededCcdPreviewExposure(expected, 2)

    expect(first.counts).not.toStrictEqual(second.counts)
  })

  it('does not mutate the deterministic Expected CCD Spectrum', () => {
    const expected = createExpectedFixture()
    const before = structuredClone(expected)

    simulateSeededCcdPreviewExposure(expected, 77)

    expect(expected).toStrictEqual(before)
    expect(Object.isFrozen(expected)).toBe(true)
    expect(Object.isFrozen(expected.expected_counts)).toBe(true)
  })

  it('keeps zero and near-zero inputs finite and non-negative', () => {
    const zero = simulateSeededCcdPreviewExposure(
      createExpectedFixture({ signal_counts: 0, dark_counts: 0 }),
      10,
    )
    const nearZero = simulateSeededCcdPreviewExposure(
      createExpectedFixture({ signal_counts: 1e-12, dark_counts: 1e-12 }),
      11,
    )

    for (const exposure of [zero, nearZero]) {
      expect(exposure.counts.every(Number.isFinite)).toBe(true)
      expect(exposure.unclipped_counts.every(Number.isFinite)).toBe(true)
      expect(exposure.counts.every((value) => value >= 0)).toBe(true)
    }
  })

  it('keeps saturated realizations inside detector bounds', () => {
    const fullWell = 100
    const exposure = simulateSeededCcdPreviewExposure(
      createExpectedFixture({
        signal_counts: 1_000,
        dark_counts: 100,
        read_noise_rms_counts: 50,
        full_well_counts: fullWell,
      }),
      999,
    )

    expect(exposure.counts.every((value) => value >= 0)).toBe(true)
    expect(exposure.counts.every((value) => value <= fullWell)).toBe(true)
  })
})

describe('documented simplified detector-noise statistics', () => {
  const sampleCount = 20_000

  it('approximates shot-noise variance from signal expectation', () => {
    const exposure = simulateSeededCcdPreviewExposure(
      createExpectedFixture({
        length: sampleCount,
        signal_counts: 100,
        dark_counts: 0,
        read_noise_rms_counts: 0,
        full_well_counts: 1_000_000,
      }),
      1001,
    )

    expect(average(exposure.counting_noise_counts)).toBeCloseTo(0, 0)
    expect(variance(exposure.counting_noise_counts)).toBeCloseTo(100, -1)
    expect(average(exposure.counts)).toBeCloseTo(100, 0)
  })

  it('includes dark-current expectation in counting-noise variance', () => {
    const exposure = simulateSeededCcdPreviewExposure(
      createExpectedFixture({
        length: sampleCount,
        signal_counts: 0,
        dark_counts: 25,
        read_noise_rms_counts: 0,
        full_well_counts: 1_000_000,
      }),
      1002,
    )

    expect(variance(exposure.counting_noise_counts)).toBeCloseTo(25, 0)
    expect(average(exposure.counts)).toBeCloseTo(25, 0)
  })

  it('applies configured read-noise RMS as an independent Gaussian term', () => {
    const readNoiseRms = 3
    const exposure = simulateSeededCcdPreviewExposure(
      createExpectedFixture({
        length: sampleCount,
        signal_counts: 100,
        dark_counts: 0,
        read_noise_rms_counts: readNoiseRms,
        full_well_counts: 1_000_000,
      }),
      1003,
    )

    expect(average(exposure.read_noise_counts)).toBeCloseTo(0, 0)
    expect(variance(exposure.read_noise_counts)).toBeCloseTo(
      readNoiseRms ** 2,
      0,
    )
  })
})

