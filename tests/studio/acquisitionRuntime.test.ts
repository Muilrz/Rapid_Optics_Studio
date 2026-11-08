import { describe, expect, it, vi } from 'vitest'
import { createStudioStore } from '../../src/store/studioStore'
import { AcquisitionRuntimeSchema, completeAcquisition, simulateAcquisitionExposure } from '../../src/core/acquisition'
import { manualAcquisitionScheduler } from '../fixtures/acquisitionScheduler'

describe('Phase 4C acquisition execution and atomic completion', () => {
  it.each([1, 20])('finishes exactly N=%i exposures, once, outside editor history/derived', (n) => {
    const scheduler = manualAcquisitionScheduler()
    const expose = vi.fn(simulateAcquisitionExposure)
    const store = createStudioStore(undefined, undefined, undefined, { ...scheduler.services, expose })
    const history = store.getState().history
    const derived = store.getState().derived
    expect(store.getState().startAcquisition({ mode: n === 1 ? 'single' : 'average', number_of_exposures: n })).toBe(true)
    expect(expose).not.toHaveBeenCalled()
    expect(store.getState().startAcquisition({ mode: 'single', number_of_exposures: 1 })).toBe(false)
    const oldCallback = scheduler.step()
    oldCallback()
    scheduler.flush()
    const state = store.getState()
    expect(expose).toHaveBeenCalledTimes(n)
    expect(state.acquisition.runtime.status).toBe('completed')
    expect(state.acquisition.completedRuns).toHaveLength(1)
    expect(state.acquisition.completedRuns[0]!.exposures).toHaveLength(n)
    expect(state.history).toBe(history)
    expect(state.derived).toBe(derived)
    expect(AcquisitionRuntimeSchema.safeParse(state.acquisition.runtime).success).toBe(true)
    oldCallback()
    expect(store.getState().acquisition.completedRuns).toHaveLength(1)
    expect(store.getState().startAcquisition({ mode: 'single', number_of_exposures: 1 })).toBe(true)
    scheduler.flush()
    expect(store.getState().acquisition.completedRuns).toHaveLength(2)
  })

  it.each([0, 1])('retains cancelled k=%i frames and rejects stale callbacks across restart', (k) => {
    const scheduler = manualAcquisitionScheduler()
    const store = createStudioStore(undefined, undefined, undefined, scheduler.services)
    store.getState().startAcquisition({ mode: 'average', number_of_exposures: 3 })
    if (k) scheduler.step()
    const oldCallback = scheduler.tasks[0]!.callback
    store.getState().cancelAcquisition('Instrument configuration changed.')
    const cancelled = store.getState().acquisition.cancelledRuns[0]!
    expect(cancelled.exposures).toHaveLength(k)
    expect(cancelled).not.toHaveProperty('acquired_spectrum')
    expect(store.getState().acquisition.completedRuns).toHaveLength(0)
    store.getState().startAcquisition({ mode: 'single', number_of_exposures: 1 })
    oldCallback()
    scheduler.flush()
    expect(store.getState().acquisition.completedRuns).toHaveLength(1)
    expect(store.getState().acquisition.cancelledRuns[0]).toBe(cancelled)
  })

  it.each(['expose', 'complete'] as const)('isolates %s errors and allows recovery without half-records', (failure) => {
    const scheduler = manualAcquisitionScheduler()
    let broken = true
    const store = createStudioStore(undefined, undefined, undefined, {
      ...scheduler.services,
      expose: (...args) => { if (broken && failure === 'expose') throw new Error('Exposure failed.'); return simulateAcquisitionExposure(...args) },
      complete: (...args) => { if (broken && failure === 'complete') throw new Error('Metrics failed.'); return completeAcquisition(...args) },
    })
    store.getState().startAcquisition({ mode: 'single', number_of_exposures: 1 })
    const callback = scheduler.tasks[0]!.callback
    scheduler.flush()
    const runtime = store.getState().acquisition.runtime
    expect(runtime.status).toBe('error')
    expect(store.getState().acquisition.completedRuns).toHaveLength(0)
    expect(AcquisitionRuntimeSchema.safeParse(runtime).success).toBe(true)
    broken = false
    store.getState().startAcquisition({ mode: 'single', number_of_exposures: 1 })
    callback()
    scheduler.flush()
    expect(store.getState().acquisition.completedRuns).toHaveLength(1)
  })

  it('rejects invalid starts with a readable error and preserves completed records', () => {
    const scheduler = manualAcquisitionScheduler()
    const store = createStudioStore(undefined, undefined, undefined, scheduler.services)
    store.getState().startAcquisition({ mode: 'single', number_of_exposures: 1 })
    scheduler.flush()
    const oldRun = store.getState().acquisition.completedRuns[0]
    expect(store.getState().startAcquisition({ mode: 'average', number_of_exposures: 1 })).toBe(false)
    store.getState().setDetectorConfiguration({ ...store.getState().authoritative.detectorConfiguration, integration_time_s: 0 })
    expect(store.getState().startAcquisition({ mode: 'single', number_of_exposures: 1 })).toBe(false)
    expect(store.getState().acquisition.lastStartError).toMatch(/Integration/)
    expect(store.getState().acquisition.completedRuns[0]).toBe(oldRun)
  })

  it('rejects ambiguous target chains instead of using Preview priority', () => {
    const scheduler = manualAcquisitionScheduler()
    const store = createStudioStore(undefined, undefined, undefined, scheduler.services)
    const laser = store.getState().authoritative.scene.components.find((c) => c.type === 'laser')!
    store.getState().replaceScene({ ...store.getState().authoritative.scene,
      components: [...store.getState().authoritative.scene.components, { ...laser, id: 'component:second-laser' as typeof laser.id }] })
    expect(store.getState().startAcquisition({ mode: 'single', number_of_exposures: 1 })).toBe(false)
    expect(store.getState().acquisition.lastStartError).toMatch(/unambiguous/)
  })
})
