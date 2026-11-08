import { describe, expect, it } from 'vitest'
import { createStudioStore } from '../../src/store/studioStore'
import { estimateAcquisitionRetentionBytes } from '../../src/store/acquisitionRuntime'
import { Transform2DSchema } from '../../src/core/optics'
import { manualAcquisitionScheduler } from '../fixtures/acquisitionScheduler'
import { createPhase4FAcceptanceScene, PHASE4_F_LASER_POWER_MW } from '../fixtures/phase4AcceptanceScene'
import { DEFAULT_RAMAN_SCENE } from '../../src/project/defaults/defaultRamanScene'
import { DEFAULT_VIRTUAL_CCD_CONFIGURATION } from '../../src/core/acquisition'

describe('Phase 4F F/G, immutable data and retention safeguards', () => {
  it('satisfies PRD F at 1s/N=20 using a traceable unsaturated low-power optical scene', () => {
    const scheduler = manualAcquisitionScheduler()
    const scene = createPhase4FAcceptanceScene()
    const store = createStudioStore(scene, undefined, undefined, scheduler.services)
    expect(scene.components.filter((c) => c.type !== 'laser')).toEqual(DEFAULT_RAMAN_SCENE.components.filter((c) => c.type !== 'laser'))
    expect(store.getState().authoritative.detectorConfiguration).toEqual(DEFAULT_VIRTUAL_CCD_CONFIGURATION)
    expect(store.getState().startAcquisition({ mode: 'average', number_of_exposures: 20 })).toBe(true)
    scheduler.flush()
    const state = store.getState()
    expect(state.acquisition.runtime.status).toBe('completed')
    expect(state.acquisition.completedRuns).toHaveLength(1)
    const run = state.acquisition.completedRuns[0]!
    const snapshot = run.input.instrument_snapshot
    const laser = snapshot.optical_scene.components.find((c) => c.id === snapshot.target.laser_component_id)
    if (laser?.type !== 'laser') throw new Error('Saved Laser identity required.')
    expect(laser.parameters).toEqual({ wavelength_nm: 532, power_mw: PHASE4_F_LASER_POWER_MW })
    expect(snapshot.context.path_state).toBe('valid-signal-path')
    expect(snapshot.detector.integration_time_s).toBe(1)
    expect(snapshot.detector.full_well_counts).toBe(60_000)
    expect(snapshot.detector.gain_counts_per_photoelectron).toBe(340)
    expect(run.input.request).toEqual({ mode: 'average', number_of_exposures: 20 })
    expect(run.exposures).toHaveLength(20)
    expect(run.acquired_spectrum.number_of_exposures).toBe(20)
    expect(run.input.expected_spectrum.saturated_bin_count).toBe(0)
    expect(run.metrics.snr.status).toBe('available')
    expect(run.metrics.rayleigh_od.status).toBe('available')
    if (run.metrics.snr.status !== 'available' || run.metrics.rayleigh_od.status !== 'available') throw new Error('Finite model metrics required for F.')
    expect(Number.isFinite(run.metrics.snr.value)).toBe(true)
    expect(run.metrics.snr.value).toBeGreaterThan(0)
    expect(run.metrics.snr.number_of_exposures).toBe(20)
    expect(run.metrics.rayleigh_od.value).toBe(-Math.log10(snapshot.context.rayleigh_return.leakage_throughput_to_spectrometer_input))
    const bins = run.input.expected_spectrum.axis.values_cm_1.length
    expect(run.acquired_spectrum.counts).toHaveLength(bins)
    const peak = run.metrics.snr.peak_bin_index
    run.exposures.forEach((frame, index) => {
      expect(frame.exposure_index).toBe(index)
      expect(frame.run_id).toBe(run.input.id)
      expect(frame.counts).toHaveLength(bins)
      expect(frame.clipped_high[peak]).toBe(false)
      expect(frame.clipped_low[peak]).toBe(false)
      expect(frame.counts.every((value) => Number.isFinite(value) && value >= 0 && value <= 60_000)).toBe(true)
    })
    expect(run.exposures[0]!.counts).not.toEqual(run.exposures[1]!.counts)
    // Independent direct sum verifies the saved mean over EVERY bin.
    run.acquired_spectrum.counts.forEach((value, bin) => {
      const mean = run.exposures.reduce((sum, frame) => sum + frame.counts[bin]!, 0) / 20
      expect(Math.abs(value - mean)).toBeLessThan(1e-9)
    })
    const saved = structuredClone(run)
    expect(Object.isFrozen(snapshot.optical_scene.components[0]!.parameters)).toBe(true)
    store.getState().updateComponentParameters(laser.id, { ...laser.parameters, power_mw: 1 })
    store.getState().undo()
    store.getState().redo()
    expect(store.getState().acquisition.completedRuns[0]).toEqual(saved)
    expect(run.input.instrument_snapshot.optical_scene).toEqual(scene)
  })

  it('preserves saturated default data and G cancellation without inventing finite SNR', () => {
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
    // The default peak is saturated: do not masquerade this as quantitative SNR.
    expect(run.metrics.snr.value).toBeNull()
    if (run.metrics.snr.status === 'undefined') expect(run.metrics.snr.undefined_reason).toMatch(/saturated|clipped/)
    expect(run.metrics.rayleigh_od.status).toBe('available')
    expect(run.input.instrument_snapshot.detector).toEqual(DEFAULT_VIRTUAL_CCD_CONFIGURATION)
    const originalLaser = run.input.instrument_snapshot.optical_scene.components.find((c) => c.type === 'laser')
    expect(originalLaser?.parameters.power_mw).toBe(10)
    expect(run.input.expected_spectrum.saturated_bin_count).toBeGreaterThan(0)
    expect(run.exposures.some((frame) => frame.clipped_high.some(Boolean))).toBe(true)
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
