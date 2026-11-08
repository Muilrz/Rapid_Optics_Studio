import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import {
  AcquisitionExposureSchema, AcquisitionInputSchema, CompletedAcquisitionRunSchema,
  calculatePeakSnr, calculateRayleighOd, createAcquisitionRandom, completeAcquisition,
  simulateAcquisitionExposure, averageAcquisitionExposures, meanNoiseRmsCounts,
  PeakSnrMetricSchema, RayleighOdMetricSchema,
  calculateExpectedCcdSpectrumFromRamanContext,
} from '../../src/core/acquisition'
import { RamanOpticalContextSchema } from '../../src/core/raman'
import { buildAcquisitionInput } from '../../src/core/acquisition/instrumentInput'
import { createStudioStore } from '../../src/store/studioStore'
import { AcquisitionRunInspector } from '../../src/features/acquisition/AcquisitionPanel'

const inputFor = (n = 1, integration = 0.01) => {
  const design = createStudioStore().getState().authoritative
  return buildAcquisitionInput({ ...design, detectorConfiguration: { ...design.detectorConfiguration, integration_time_s: integration } },
    { mode: n === 1 ? 'single' : 'average', number_of_exposures: n }, 'run:metrics', '2026-11-08T00:00:00.000Z', 0)
}
const dataFor = (n = 1, integration = 0.01) => {
  const input = inputFor(n, integration)
  const rng = createAcquisitionRandom(input)
  const frames = Array.from({ length: n }, (_, i) => simulateAcquisitionExposure(input, i, rng))
  return { input, frames, raw: averageAcquisitionExposures(input, frames) }
}

describe('Rayleigh path optical density with explicit reference', () => {
  it.each([[1, 0], [0.1, 1], [1e-6, 6], [Number.MIN_VALUE, -Math.log10(Number.MIN_VALUE)]])('T=%s gives OD=%s without an epsilon clamp', (transmission, expected) => {
    const data = inputFor()
    const input = AcquisitionInputSchema.parse({ ...data, instrument_snapshot: { ...data.instrument_snapshot,
      context: { ...data.instrument_snapshot.context, rayleigh_return: { ...data.instrument_snapshot.context.rayleigh_return,
        leakage_throughput_to_spectrometer_input: transmission } } } })
    const result = calculateRayleighOd(input)
    expect(result.status).toBe('available')
    expect(result.value).toBeCloseTo(expected, 12)
    if (result.status === 'available') {
      expect(result.unit).toBe('OD')
      expect(result.excitation_wavelength_nm).toBe(532)
      expect(result.scientific_semantics).toContain('spectrometer-input')
      expect(RayleighOdMetricSchema.safeParse(result).success).toBe(true)
    }
  })

  it.each([0, null])('does not turn zero throughput or missing path into a fabricated finite OD (%s)', (transmission) => {
    const data = inputFor()
    const result = calculateRayleighOd({ ...data, instrument_snapshot: { ...data.instrument_snapshot,
      context: RamanOpticalContextSchema.parse({ ...data.instrument_snapshot.context, rayleigh_return: { ...data.instrument_snapshot.context.rayleigh_return,
        geometric_path_reaches_spectrometer: transmission !== null,
        leakage_throughput_to_spectrometer_input: transmission ?? 0 } }) } })
    expect(result.status).toBe('undefined')
    expect(result.value).toBeNull()
  })

  it('responds to real filter OD and excludes Spectrometer detector throughput', () => {
    const store = createStudioStore()
    const filter = store.getState().authoritative.scene.components.find((c) => c.type === 'filter')!
    const build = () => buildAcquisitionInput(store.getState().authoritative, { mode: 'single', number_of_exposures: 1 }, 'run:filter', '2026-11-08T00:00:00.000Z', 0)
    store.getState().updateComponentParameters(filter.id, { raman_transmission: 1, rayleigh_suppression_od: 4, leakage_model: 'constant' })
    const first = calculateRayleighOd(build())
    store.getState().updateComponentParameters(filter.id, { raman_transmission: 1, rayleigh_suppression_od: 6, leakage_model: 'constant' })
    const second = calculateRayleighOd(build())
    expect(first.status).toBe('available')
    expect(second.status).toBe('available')
    expect(second.value! - first.value!).toBeCloseTo(2, 12)
    const spectrometer = store.getState().authoritative.scene.components.find((c) => c.type === 'spectrometer')!
    store.getState().updateComponentParameters(spectrometer.id, { ...spectrometer.parameters, optical_throughput: 0.5 })
    expect(calculateRayleighOd(build())).toEqual(second)
  })
})

describe('Predicted Raman peak-bin SNR of the complete raw mean', () => {
  it('uses existing counts-domain Gaussian variance, including dark/background once', () => {
    expect(meanNoiseRmsCounts(100, 3, 4)).toBeCloseTo(Math.sqrt(109) / 2, 14)
    expect(meanNoiseRmsCounts(0, 0, 1)).toBe(1)
    expect(Number.isFinite(meanNoiseRmsCounts(1, Number.MAX_VALUE, 20))).toBe(true)
    for (const n of [0, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) expect(() => meanNoiseRmsCounts(100, 3, n)).toThrow()
  })

  it('computes finite N=1 and N=4 metrics with sqrt(N) scaling, not empirical noise fitting', () => {
    const one = dataFor(1)
    const four = dataFor(4)
    const first = calculatePeakSnr(one.input, one.frames, one.raw)
    const second = calculatePeakSnr(four.input, four.frames, four.raw)
    expect(first.status).toBe('available')
    expect(second.status).toBe('available')
    if (first.status !== 'available' || second.status !== 'available') throw new Error('Unsaturated peak required.')
    expect(second.value).toBeCloseTo(first.value * 2, 12)
    expect(first.signal_counts).toBeGreaterThan(0)
    expect(first.signal_counts).toBeLessThanOrEqual(one.input.expected_spectrum.signal_counts[first.peak_bin_index]!)
    expect(first.value).toBe(first.signal_counts / first.noise_rms_counts)
    expect(first.peak_shift_cm_1).toBeGreaterThan(500)
    expect(first.peak_shift_cm_1).toBeLessThan(540)
    expect(PeakSnrMetricSchema.safeParse(first).success).toBe(true)
  })

  it('rejects quantitative Peak SNR at the default saturated 1s peak', () => {
    const data = dataFor(20, 1)
    const result = calculatePeakSnr(data.input, data.frames, data.raw)
    expect(result.status).toBe('undefined')
    if (result.status === 'undefined') expect(result.undefined_reason).toMatch(/saturated|clipped/)
  })

  it('rejects observed clipping at the selected bin, even when expected is unsaturated', () => {
    const data = dataFor(1)
    const metric = calculatePeakSnr(data.input, data.frames, data.raw)
    if (metric.status !== 'available') throw new Error('Unsaturated peak required.')
    const i = metric.peak_bin_index
    const frame = data.frames[0]!
    const clipped = AcquisitionExposureSchema.parse({ ...frame,
      counts: frame.counts.map((v, j) => j === i ? 0 : v), clipped_low: frame.clipped_low.map((v, j) => j === i || v) })
    const raw = averageAcquisitionExposures(data.input, [clipped])
    expect(calculatePeakSnr(data.input, [clipped], raw).status).toBe('undefined')
  })

  it('does not fabricate a peak from zero Raman, fluorescence or incomplete N', () => {
    const data = dataFor(1)
    const s = data.input.instrument_snapshot
    const material = { ...s.material, fluorescence_level: 1,
      peaks: s.material.peaks.map((p) => ({ ...p, relative_intensity: 0 })) }
    const expected = calculateExpectedCcdSpectrumFromRamanContext({ context: s.context, material,
      axis: data.input.expected_spectrum.axis, excitation_wavelength_nm: s.context.excitation_wavelength_nm!,
      spectrometer: s.spectrometer, detector: s.detector })
    const zeroInput = AcquisitionInputSchema.parse({ ...data.input, expected_spectrum: expected,
      instrument_snapshot: { ...s, material, material_dataset: { ...s.material_dataset, materials: [material] } } })
    expect(expected.signal_counts.some((n) => n > 0)).toBe(true) // background is not a Raman peak
    const frame = simulateAcquisitionExposure(zeroInput, 0, createAcquisitionRandom(zeroInput))
    expect(calculatePeakSnr(zeroInput, [frame], averageAcquisitionExposures(zeroInput, [frame])).status).toBe('undefined')
    expect(() => calculatePeakSnr(data.input, [], data.raw)).toThrow()
  })

  it('stores immutable numeric evidence, rejects inconsistent contracts, and renders qualified values', () => {
    const data = dataFor(4)
    const saved = structuredClone(data)
    const run = completeAcquisition(data.input, data.frames, '2026-11-08T00:00:01.000Z')
    expect(data).toEqual(saved)
    expect(run.metrics.snr.status).toBe('available')
    expect(run.metrics.rayleigh_od.status).toBe('available')
    expect(Object.isFrozen(run.metrics.snr)).toBe(true)
    expect(run.exposures).toEqual(data.frames)
    expect(run.acquired_spectrum).toEqual(data.raw)
    if (run.metrics.snr.status !== 'available' || run.metrics.rayleigh_od.status !== 'available') throw new Error('Numeric metrics required.')
    for (const patch of [{ value: Infinity }, { value: 123 }, { peak_bin_index: 999_999 }, { number_of_exposures: 1 }, { noise_rms_counts: 1 }]) {
      expect(CompletedAcquisitionRunSchema.safeParse({ ...run, metrics: { ...run.metrics, snr: { ...run.metrics.snr, ...patch } } }).success).toBe(false)
    }
    expect(CompletedAcquisitionRunSchema.safeParse({ ...run, metrics: { ...run.metrics, rayleigh_od: { ...run.metrics.rayleigh_od, transmission: 0.1 } } }).success).toBe(false)
    const markup = renderToStaticMarkup(createElement(AcquisitionRunInspector, { run }))
    expect(markup).toContain('Peak SNR (predicted model)')
    expect(markup).toContain('Rayleigh path OD (model)')
    expect(markup).toContain('model-peak-bin-snr-v1')
    expect(markup).toContain('rayleigh-path-od-v1')
    expect(markup).toContain('not empirical SNR')
    expect(markup).toContain('not calibrated spectral filter OD')
  })
})
