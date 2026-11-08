import { describe, expect, it } from 'vitest'
import { createStudioStore } from '../../src/store/studioStore'
import { estimateAcquisitionRetentionBytes } from '../../src/store/acquisitionRuntime'
import { Transform2DSchema } from '../../src/core/optics'
import { manualAcquisitionScheduler } from '../fixtures/acquisitionScheduler'

describe('Phase 4F F/G, immutable data and retention safeguards', () => {
  it('runs PRD F and G while preserving old snapshots, axes, arrays and metrics', () => {
    const scheduler = manualAcquisitionScheduler()
    const store = createStudioStore(undefined, undefined, undefined, scheduler.services)
    expect(store.getState().authoritative.detectorConfiguration.integration_time_s).toBe(1)
    store.getState().startAcquisition({ mode: 'average', number_of_exposures: 20 })
    scheduler.flush()
    const run = store.getState().acquisition.completedRuns[0]!
    expect(run.exposures).toHaveLength(20)
    expect(run.input.request.number_of_exposures).toBe(20)
    const saved = structuredClone(run)
    store.getState().startAcquisition({ mode: 'average', number_of_exposures: 20 })
    scheduler.step()
    const mirror = store.getState().authoritative.scene.components.find((c) => c.type === 'mirror')!
    store.getState().updateComponentTransform(mirror.id, Transform2DSchema.parse({ ...mirror.transform, y_mm: mirror.transform.y_mm + 25 }))
    scheduler.flush()
    expect(store.getState().acquisition.runtime.status).toBe('cancelled')
    expect(store.getState().acquisition.completedRuns).toHaveLength(1)
    store.getState().undo()
    store.getState().redo()
    store.getState().undo()
    const sample = store.getState().authoritative.scene.components.find((c) => c.type === 'sample')!
    store.getState().updateComponentParameters(sample.id, { material_id: 'material:polystyrene' })
    store.getState().setDetectorConfiguration({ ...store.getState().authoritative.detectorConfiguration, integration_time_s: 2, full_well_counts: 1000 })
    store.getState().startAcquisition({ mode: 'single', number_of_exposures: 1 })
    scheduler.flush()
    expect(store.getState().acquisition.completedRuns).toHaveLength(2)
    expect(store.getState().acquisition.completedRuns[0]).toEqual(saved)
    expect(run.input.expected_spectrum.axis).not.toEqual(store.getState().acquisition.completedRuns[1]!.input.expected_spectrum.axis)
    // Unresolved numerical acceptance remains explicit, never masquerading as a pass.
    expect(run.metrics.snr.value).toBeNull()
    expect(run.metrics.rayleigh_od.value).toBeNull()
  })

  it('rejects oversized requests and cumulative retention without discarding records', () => {
    const scheduler = manualAcquisitionScheduler()
    const spectrum = createStudioStore().getState().derived.spectrum
    if (spectrum.kind !== 'ready') throw new Error(spectrum.reason)
    const budget = estimateAcquisitionRetentionBytes(spectrum.expectedCcdSpectrum.axis.values_cm_1.length, 20) * 1.5
    const store = createStudioStore(undefined, undefined, undefined, { ...scheduler.services, retainedDataBudgetBytes: budget })
    expect(store.getState().startAcquisition({ mode: 'average', number_of_exposures: Number.MAX_SAFE_INTEGER })).toBe(false)
    expect(store.getState().acquisition.lastStartError).toMatch(/retention safety budget/)
    expect(scheduler.tasks).toHaveLength(0)
    store.getState().startAcquisition({ mode: 'average', number_of_exposures: 20 })
    scheduler.flush()
    const run = store.getState().acquisition.completedRuns[0]
    expect(run).toBeDefined()
    expect(store.getState().startAcquisition({ mode: 'average', number_of_exposures: 20 })).toBe(false)
    expect(store.getState().acquisition.completedRuns[0]).toBe(run)
  })

  it('measures retained payload scaling on the real CCD grid (N=20 and N=200)', () => {
    for (const n of [20, 200]) {
      const scheduler = manualAcquisitionScheduler()
      const store = createStudioStore(undefined, undefined, undefined, scheduler.services)
      const began = performance.now()
      expect(store.getState().startAcquisition({ mode: 'average', number_of_exposures: n })).toBe(true)
      scheduler.flush()
      const run = store.getState().acquisition.completedRuns[0]!
      const bins = run.input.expected_spectrum.axis.values_cm_1.length
      const payload = new TextEncoder().encode(JSON.stringify(run)).byteLength
      const estimate = estimateAcquisitionRetentionBytes(bins, n)
      expect(estimate).toBeGreaterThan(payload)
      console.info(`Acquisition resource sample: N=${n}, bins=${bins}, JSON=${payload}, retentionEstimate=${estimate}, elapsedMs=${Math.round(performance.now() - began)}`)
    }
  })
})
