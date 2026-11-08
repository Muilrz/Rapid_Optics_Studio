import { describe, expect, it } from 'vitest'
import { createStudioStore, type StudioStore } from '../../src/store/studioStore'
import { completeAcquisition, simulateAcquisitionExposure } from '../../src/core/acquisition'
import { Transform2DSchema, Vec2Schema, type OpticalComponentType } from '../../src/core/optics'
import { manualAcquisitionScheduler } from '../fixtures/acquisitionScheduler'

const component = (store: StudioStore, type: OpticalComponentType) => store.getState().authoritative.scene.components.find((c) => c.type === type)!
const move = (store: StudioStore) => {
  const mirror = component(store, 'mirror')
  store.getState().updateComponentTransform(mirror.id, Transform2DSchema.parse({ ...mirror.transform, x_mm: mirror.transform.x_mm + 10 }))
}
const operations: [string, (store: StudioStore) => void][] = [
  ['move', move],
  ['optical parameter', (s) => s.getState().updateComponentParameters(component(s, 'mirror').id, { reflectivity: 0.5 })],
  ['sample', (s) => s.getState().updateComponentParameters(component(s, 'sample').id, { material_id: 'material:polystyrene' })],
  ['wavelength', (s) => { const laser = component(s, 'laser'); s.getState().updateComponentParameters(laser.id, { ...laser.parameters, wavelength_nm: 633 }) }],
  ['aperture', (s) => s.getState().updateComponentGeometry(component(s, 'mirror').id, 1)],
  ['enabled', (s) => s.getState().updateComponentCommon(component(s, 'mirror').id, { enabled: false })],
  ['add', (s) => { s.getState().addComponent('mirror', Vec2Schema.parse({ x: 1, y: 2 })) }],
  ['delete', (s) => { s.getState().deleteComponent(component(s, 'mirror').id) }],
  ['duplicate', (s) => { s.getState().setSelection(component(s, 'mirror').id); s.getState().duplicateSelection() }],
  ['paste', (s) => { s.getState().setSelection(component(s, 'mirror').id); s.getState().copySelection(); s.getState().pasteClipboard() }],
  ['detector', (s) => s.getState().setDetectorConfiguration({ ...s.getState().authoritative.detectorConfiguration, read_noise_rms_counts: 12 })],
  ['integration', (s) => s.getState().setDetectorConfiguration({ ...s.getState().authoritative.detectorConfiguration, integration_time_s: 2 })],
  ['simulation', (s) => s.getState().setSimulationConfiguration({ ...s.getState().authoritative.simulationConfiguration, max_generations: 10 })],
  ['replaceScene', (s) => { const mirror = component(s, 'mirror'); s.getState().replaceScene({ ...s.getState().authoritative.scene,
    components: s.getState().authoritative.scene.components.filter((c) => c.id !== mirror.id) }) }],
]

describe('Phase 4D configuration cancellation boundaries', () => {
  it.each(operations)('atomically cancels on %s and retains accepted frames', (_, operation) => {
    const scheduler = manualAcquisitionScheduler()
    const store = createStudioStore(undefined, undefined, undefined, scheduler.services)
    store.getState().startAcquisition({ mode: 'average', number_of_exposures: 3 })
    scheduler.step()
    let mixedUpdate = false
    const unsubscribe = store.subscribe((next, previous) => {
      if (next.authoritative !== previous.authoritative && next.acquisition.runtime.status === 'running') mixedUpdate = true
    })
    operation(store)
    unsubscribe()
    expect(mixedUpdate).toBe(false)
    expect(store.getState().acquisition.runtime.status).toBe('cancelled')
    expect(store.getState().acquisition.cancelledRuns[0]!.exposures).toHaveLength(1)
    const saved = structuredClone(store.getState().acquisition.cancelledRuns[0])
    scheduler.flush()
    expect(store.getState().acquisition.completedRuns).toHaveLength(0)
    expect(store.getState().acquisition.cancelledRuns[0]).toEqual(saved)
  })

  it('does not cancel on non-scientific operations or equal design replacement', () => {
    const scheduler = manualAcquisitionScheduler()
    const store = createStudioStore(undefined, undefined, undefined, scheduler.services)
    const mirror = component(store, 'mirror')
    store.getState().startAcquisition({ mode: 'average', number_of_exposures: 3 })
    store.getState().setSelection(mirror.id)
    store.getState().setGridVisible(false)
    store.getState().setSnapEnabled(false)
    store.getState().panView({ x_px: 10, y_px: 10 })
    store.getState().zoomViewAt({ x_px: 50, y_px: 50 }, 2)
    store.getState().copySelection()
    store.getState().setComponentLocked(mirror.id, true)
    store.getState().setComponentLocked(mirror.id, false)
    store.getState().updateComponentCommon(mirror.id, { name: 'New label' })
    store.getState().undo()
    store.getState().redo()
    store.getState().replaceScene(structuredClone(store.getState().authoritative.scene))
    expect(store.getState().acquisition.runtime.status).toBe('running')
    expect(Object.isFrozen(component(store, 'mirror').transform)).toBe(false)
    scheduler.flush()
    expect(store.getState().acquisition.runtime.status).toBe('completed')
  })

  it.each(['undo', 'redo', 'rollback'] as const)('cancels when %s restores different scientific input', (action) => {
    const scheduler = manualAcquisitionScheduler()
    const store = createStudioStore(undefined, undefined, undefined, scheduler.services)
    if (action === 'rollback') store.getState().beginHistoryTransaction('drag')
    move(store)
    if (action === 'redo') store.getState().undo()
    store.getState().startAcquisition({ mode: 'average', number_of_exposures: 3 })
    if (action === 'rollback') store.getState().cancelHistoryTransaction()
    else store.getState()[action]()
    expect(store.getState().acquisition.runtime.status).toBe('cancelled')
  })

  it.each(['exposure', 'completion'] as const)('rejects final-frame %s races with edits', (stage) => {
    const scheduler = manualAcquisitionScheduler()
    let store: StudioStore
    store = createStudioStore(undefined, undefined, undefined, { ...scheduler.services,
      expose: (...args) => { const frame = simulateAcquisitionExposure(...args); if (stage === 'exposure') move(store); return frame },
      complete: (...args) => { const run = completeAcquisition(...args); if (stage === 'completion') move(store); return run },
    })
    store.getState().startAcquisition({ mode: 'single', number_of_exposures: 1 })
    scheduler.flush()
    expect(store.getState().acquisition.runtime.status).toBe('cancelled')
    expect(store.getState().acquisition.completedRuns).toHaveLength(0)
    expect(store.getState().acquisition.cancelledRuns[0]!.exposures).toHaveLength(stage === 'completion' ? 1 : 0)
  })

  it('checks scientific configuration before accepting callbacks even when mutation bypasses an action', () => {
    const scheduler = manualAcquisitionScheduler()
    const store = createStudioStore(undefined, undefined, undefined, scheduler.services)
    store.getState().startAcquisition({ mode: 'single', number_of_exposures: 1 })
    store.setState({ authoritative: { ...store.getState().authoritative,
      detectorConfiguration: { ...store.getState().authoritative.detectorConfiguration, integration_time_s: 2 } } })
    scheduler.flush()
    expect(store.getState().acquisition.runtime.status).toBe('cancelled')
    expect(store.getState().acquisition.completedRuns).toHaveLength(0)
  })
})
