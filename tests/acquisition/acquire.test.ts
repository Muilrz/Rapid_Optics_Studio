import { describe, expect, it } from 'vitest'
import {
  AcquisitionInputSchema, AcquisitionExposureSchema, averageAcquisitionExposures,
  completeAcquisition, createAcquisitionRandom, simulateAcquisitionExposure,
  simulateCcdPreviewExposure, createMulberry32RandomNumberGenerator,
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
    expect(run.metrics.rayleigh_od.value).toBeNull()
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
})
