import { describe, expect, it } from 'vitest'
import { applyStep, createPipeline, replayPipeline, runSpectra, validateSamples, type ProcessingStep } from '../../src/core/analysis/processing'
import { detectPeaks, manualPeak, referencePeaks } from '../../src/core/analysis/peaks'
import { BUILT_IN_RAMAN_MATERIALS } from '../../src/core/raman'
import { createStudioStore } from '../../src/store/studioStore'
import { createPhase4FAcceptanceScene } from '../fixtures/phase4AcceptanceScene'
import { manualAcquisitionScheduler } from '../fixtures/acquisitionScheduler'

const baseline = { id: 1, kind: 'baseline', radius: 1, enabled: true } as const
const smoothing = { id: 2, kind: 'smoothing', radius: 1, enabled: true } as const
const normalize = { id: 3, kind: 'normalize', method: 'max-absolute', enabled: true } as const

describe('Phase 5 spectrum analysis', () => {
  it('uses a flat opening and truncated moving average without changing inputs', () => {
    const input = Object.freeze([2, 2, 8, 2, 2])
    const corrected = applyStep(input, baseline)
    expect(corrected).toEqual([0, 0, 6, 0, 0])
    expect(applyStep(corrected, smoothing)).toEqual([0, 2, 2, 2, 0])
    expect(applyStep([2, 6], smoothing)).toEqual([4, 4])
    expect(applyStep([2, 4, 9], smoothing)[1]).toBeCloseTo(5)
    expect(input).toEqual([2, 2, 8, 2, 2])
  })

  it('handles empty, zero, constant, signed, and malformed data', () => {
    for (const step of [baseline, smoothing, normalize]) expect(applyStep([], step)).toEqual([])
    expect(applyStep([0, 0], normalize)).toEqual([0, 0])
    expect(applyStep([7, 7], baseline)).toEqual([0, 0])
    expect(applyStep([7, 7], normalize)).toEqual([1, 1])
    expect(applyStep([7, 7], { ...normalize, method: 'min-max' })).toEqual([0, 0])
    expect(applyStep([-2, 1], normalize)).toEqual([-1, 0.5])
    expect(applyStep([-2, 1, 4], { ...normalize, method: 'min-max' })).toEqual([0, 0.5, 1])
    for (const radius of [0, 1.5, 201, Infinity]) expect(() => applyStep([1], { ...smoothing, radius })).toThrow()
    expect(() => applyStep([NaN], normalize)).toThrow()
    expect(() => applyStep([Infinity], baseline)).toThrow()
    expect(() => validateSamples([1, 1], [2, 3])).toThrow()
    expect(() => validateSamples([1], [2, 3])).toThrow()
  })

  it('rejects small noise and interpolates half prominence on a nonuniform axis', () => {
    const spectrum = { id: 'raw', runId: 'test', kind: 'raw', unit: 'counts/bin', saturated: false,
      axis: [0, 1, 2, 4, 7, 8, 9, 10], values: [2, 2.2, 2, 8, 4, 2, 2.1, 2] } as const
    const peaks = detectPeaks(spectrum, 0.1)
    expect(peaks).toHaveLength(1)
    expect(peaks[0]).toMatchObject({ position_cm_1: 4, intensity: 8, source: 'auto', assignment: null })
    // Half level 5 crosses at 3 and 6.25 cm⁻¹.
    expect(peaks[0]!.fwhm).toBeCloseTo(3.25)
    expect(manualPeak(spectrum, 0).fwhm).toBeNull()
    expect(manualPeak(spectrum, 3).fwhm).toBeCloseTo(3.25)
    expect(detectPeaks({ ...spectrum, axis: [1, 2], values: [0, 0] }, 0.1)).toEqual([])
    expect(detectPeaks({ ...spectrum, axis: [], values: [] }, 0.1)).toEqual([])
    expect(() => detectPeaks(spectrum, 0)).toThrow()
    expect(() => manualPeak(spectrum, 8)).toThrow()
  })

  it('keeps the frozen reference dataset separate from measured peaks', () => {
    for (const material of BUILT_IN_RAMAN_MATERIALS) {
      const refs = referencePeaks(material)
      expect(refs).toHaveLength(material.peaks.length)
      expect(refs.every((ref) => ref.source === 'reference' && ref.assignment?.materialId === material.id)).toBe(true)
      if (material.id === 'material:polystyrene') {
        expect(refs.slice(-3).map((ref) => ref.position_cm_1)).toEqual([2852, 2904, 3054])
      }
    }
  })

  it('replays Scenario H independently of active acquisition and retained Runs', () => {
    const scheduler = manualAcquisitionScheduler()
    const store = createStudioStore(createPhase4FAcceptanceScene(), undefined, undefined, scheduler.services)
    const acquire = () => store.getState().startAcquisition({ mode: 'single', number_of_exposures: 1 })
    expect(acquire()).toBe(true)
    scheduler.flush()
    const run = store.getState().acquisition.completedRuns[0]!
    const before = structuredClone(run)
    const { raw, expected } = runSpectra(run)
    expect(raw.kind).toBe('raw')
    expect(expected.kind).toBe('expected')
    expect(raw.values).toBe(run.acquired_spectrum.counts)
    const initial = createPipeline(run.input.id)
    const steps: readonly ProcessingStep[] = [baseline, smoothing, normalize]
    const pipeline = { ...initial, steps }
    const processed = replayPipeline(run, pipeline)!
    expect(processed).toEqual(replayPipeline(run, pipeline))
    expect(processed.kind).toBe('processed')
    expect(processed.axis).toBe(raw.axis)
    expect(processed.unit).toBe('dimensionless')
    expect(Math.max(...processed.values)).toBe(1)
    expect(processed.values).not.toEqual(raw.values)
    expect(processed.pipeline).toEqual(pipeline)
    expect(acquire()).toBe(true)
    const running = store.getState()
    for (const step of steps) {
      expect(replayPipeline(run, { ...pipeline, steps: steps.map((s) =>
        s.id === step.id ? { ...s, enabled: false } : s) })!.values).not.toEqual(processed.values)
    }
    expect(replayPipeline(run, { ...pipeline, steps: [baseline, { ...smoothing, radius: 4 }, normalize] })!.values).not.toEqual(processed.values)
    expect(replayPipeline(run, { ...pipeline, steps: [smoothing, baseline, normalize] })!.values).not.toEqual(processed.values)
    expect(replayPipeline(run, { ...pipeline, steps: [baseline, normalize] })!.values).not.toEqual(processed.values)
    expect(replayPipeline(run, initial)).toBeNull()
    expect(store.getState()).toBe(running)
    scheduler.flush()
    const second = store.getState().acquisition.completedRuns[1]!
    expect(() => replayPipeline(second, pipeline)).toThrow()
    expect(replayPipeline(second, { ...createPipeline(second.input.id), steps })!.runId).toBe(second.input.id)
    expect(replayPipeline(run, pipeline)).toEqual(processed)
    expect(store.getState().acquisition.completedRuns[0]).toBe(run)
    expect(run).toEqual(before)
  })
})
