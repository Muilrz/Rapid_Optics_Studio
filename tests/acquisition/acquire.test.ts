import { describe, expect, it } from 'vitest'
import {
  AcquisitionInputSchema, AcquisitionExposureSchema, averageAcquisitionExposures,
  completeAcquisition, createAcquisitionRandom, simulateAcquisitionExposure,
  simulateCcdPreviewExposure, createMulberry32RandomNumberGenerator,
  createAcquisitionRngProvenance,
} from '../../src/core/acquisition'
import { acquisitionContractFixture } from '../fixtures/acquisitionContracts'

describe('Phase 4B exposures, mean and metric availability', () => {
  it('preserves Preview counts exactly while advancing an independent Run stream', () => {
    const input = AcquisitionInputSchema.parse(acquisitionContractFixture().input)
    const saved = structuredClone(input)
    const random = createAcquisitionRandom(input)
    const previewRandom = createMulberry32RandomNumberGenerator(input.rng.seed_uint32)
    const first = simulateAcquisitionExposure(input, 0, random)
    const second = simulateAcquisitionExposure(input, 1, random)
    expect(first.counts).toEqual(simulateCcdPreviewExposure(input.expected_spectrum, previewRandom).counts)
    expect(second.counts).toEqual(simulateCcdPreviewExposure(input.expected_spectrum, previewRandom).counts)
    expect(first.counts).not.toEqual(second.counts)
    const replay = createAcquisitionRandom(input)
    expect(simulateAcquisitionExposure(input, 0, replay)).toEqual(first)
    expect(simulateAcquisitionExposure(input, 1, replay)).toEqual(second)
    expect(input).toEqual(saved)
    expect(() => simulateAcquisitionExposure(input, 2, random)).toThrow()
    expect(() => simulateAcquisitionExposure(input, 0, createMulberry32RandomNumberGenerator(1))).toThrow()
  })

  it.each([1, 2, 3])('computes the hand-checkable mean for N=%i and retains frames', (n) => {
    const fixture = acquisitionContractFixture()
    const input = AcquisitionInputSchema.parse({ ...fixture.input, request: { mode: n === 1 ? 'single' : 'average', number_of_exposures: n } })
    const frames = Array.from({ length: n }, (_, i) => AcquisitionExposureSchema.parse({ ...fixture.exposures[0], exposure_index: i, counts: [1 + 2 * i, 2 + 2 * i] }))
    const run = completeAcquisition(input, frames, '2026-11-08T00:00:01.000Z')
    expect(run.acquired_spectrum.counts).toEqual([n, n + 1])
    expect(run.exposures).toEqual(frames)
    expect(Object.isFrozen(run.exposures[0]!.counts)).toBe(true)
    expect(run.metrics.snr.value).toBeNull()
    expect(run.metrics.rayleigh_od.value).toBe(-Math.log10(input.instrument_snapshot.context.rayleigh_return.leakage_throughput_to_spectrometer_input))
  })

  it('rejects incomplete, cross-axis, cross-run and out-of-order aggregation', () => {
    const fixture = acquisitionContractFixture()
    const input = AcquisitionInputSchema.parse(fixture.input)
    const frames = fixture.exposures.map((f) => AcquisitionExposureSchema.parse(f))
    expect(() => averageAcquisitionExposures(input, frames.slice(0, 1))).toThrow()
    expect(() => averageAcquisitionExposures(input, [...frames].reverse())).toThrow()
    for (const patch of [{ run_id: 'other' }, { axis: { ...frames[1]!.axis, values_cm_1: [200, 201] } }]) {
      expect(() => averageAcquisitionExposures(input, [frames[0]!, AcquisitionExposureSchema.parse({ ...frames[1], ...patch })])).toThrow()
    }
  })

  it('keeps extreme finite counts bounded without a sum overflow', () => {
    const fixture = acquisitionContractFixture()
    const detector = { ...fixture.input.instrument_snapshot.detector, full_well_counts: Number.MAX_VALUE }
    const input = AcquisitionInputSchema.parse({ ...fixture.input,
      instrument_snapshot: { ...fixture.input.instrument_snapshot, detector },
      expected_spectrum: { ...fixture.input.expected_spectrum, detector } })
    const frames = fixture.exposures.map((f) => AcquisitionExposureSchema.parse({ ...f, counts: [Number.MAX_VALUE, Number.MAX_VALUE], detector_bounds: { minimum_counts: 0, maximum_counts: Number.MAX_VALUE } }))
    expect(averageAcquisitionExposures(input, frames).counts).toEqual([Number.MAX_VALUE, Number.MAX_VALUE])
  })

  it('reduces independent unclipped noise variance approximately by 1/N', () => {
    const fixture = acquisitionContractFixture()
    const first: number[] = []
    const means: number[] = []
    for (let seed = 0; seed < 400; seed += 1) {
      const input = AcquisitionInputSchema.parse({ ...fixture.input, id: `statistics:${seed}`,
        request: { mode: 'average', number_of_exposures: 4 }, rng: createAcquisitionRngProvenance(seed),
        expected_spectrum: { ...fixture.input.expected_spectrum,
          expected_counts: [100, 100], signal_counts: [100, 100], dark_counts: [0, 0],
          unclipped_expected_counts: [100, 100], saturated: [false, false], saturated_bin_count: 0 } })
      const rng = createAcquisitionRandom(input)
      const frames = Array.from({ length: 4 }, (_, i) => simulateAcquisitionExposure(input, i, rng))
      first.push(frames[0]!.counts[0]!)
      means.push(averageAcquisitionExposures(input, frames).counts[0]!)
    }
    const variance = (values: number[]) => {
      const mean = values.reduce((a, b) => a + b, 0) / values.length
      return values.reduce((v, x) => v + (x - mean) ** 2, 0) / values.length
    }
    const ratio = variance(means) / variance(first)
    expect(ratio).toBeGreaterThan(0.15)
    expect(ratio).toBeLessThan(0.35)
  })
})
