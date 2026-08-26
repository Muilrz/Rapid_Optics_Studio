import { describe, expect, it } from 'vitest'
import {
  OpticalSceneSchema,
  Transform2DSchema,
} from '../../src/core/optics'
import { createStudioStore } from '../../src/store/studioStore'
import { DEFAULT_RAMAN_SCENE } from '../../src/project/defaults/defaultRamanScene'

describe('Studio state boundaries', () => {
  it('keeps camera and grid changes outside authoritative and derived state', () => {
    const store = createStudioStore()
    const initial = store.getState()
    const scene = initial.authoritative.scene
    const trace = initial.derived.trace

    initial.panView({ x_px: 80, y_px: -35 })
    store.getState().setGridVisible(false)
    store.getState().zoomViewAt({ x_px: 400, y_px: 240 }, 1.5)
    const changed = store.getState()

    expect(changed.authoritative.scene).toBe(scene)
    expect(changed.authoritative.revision).toBe(0)
    expect(changed.derived.trace).toBe(trace)
    expect(changed.derived.sceneRevision).toBe(0)
    expect(changed.view.gridVisible).toBe(false)
  })

  it('recomputes derived trace atomically when replacing the scene', () => {
    const store = createStudioStore()
    const initialTrace = store.getState().derived.trace
    const sceneWithoutLaser = OpticalSceneSchema.parse({
      ...DEFAULT_RAMAN_SCENE,
      components: DEFAULT_RAMAN_SCENE.components.map((component) =>
        component.type === 'laser'
          ? { ...component, enabled: false }
          : component,
      ),
    })

    store.getState().replaceScene(sceneWithoutLaser)
    const next = store.getState()

    expect(next.authoritative.scene).toEqual(sceneWithoutLaser)
    expect(next.authoritative.revision).toBe(1)
    expect(next.derived.sceneRevision).toBe(1)
    expect(next.derived.trace).not.toBe(initialTrace)
    expect(next.derived.trace.rays).toHaveLength(0)
  })

  it('resets camera against current formal scene bounds and viewport', () => {
    const store = createStudioStore()
    const initialCenter = store.getState().view.camera.center_mm

    store.getState().setViewportSize(800, 500)
    expect(store.getState().view.viewportMeasured).toBe(true)
    store.getState().panView({ x_px: 240, y_px: 140 })
    expect(store.getState().view.camera.center_mm).not.toEqual(initialCenter)

    store.getState().resetView()
    expect(store.getState().view.camera.center_mm).toEqual(initialCenter)
    expect(store.getState().view.viewport).toEqual({
      width_px: 800,
      height_px: 500,
    })
  })

  it('exposes editor and derived state without duplicating them into the scene', () => {
    const state = createStudioStore().getState()
    const serializedScene = JSON.stringify(state.authoritative.scene)

    expect(state.editor.selectedComponentId).toBeNull()
    expect('trace' in state.authoritative).toBe(false)
    expect('setTrace' in state).toBe(false)
    expect(serializedScene).not.toContain('selectedComponentIds')
    expect(serializedScene).not.toMatch(/(?:x|y|width|height)_px/)
  })

  it('supports stable single selection without changing scene or trace', () => {
    const store = createStudioStore()
    const initial = store.getState()
    const mirror = initial.authoritative.scene.components.find(
      ({ type }) => type === 'mirror',
    )
    const sample = initial.authoritative.scene.components.find(
      ({ type }) => type === 'sample',
    )
    expect(mirror).toBeDefined()
    expect(sample).toBeDefined()
    if (!mirror || !sample) return

    initial.setSelection(mirror.id)
    expect(store.getState().editor.selectedComponentId).toBe(mirror.id)
    store.getState().setSelection(sample.id)
    expect(store.getState().editor.selectedComponentId).toBe(sample.id)
    store.getState().setSelection(null)

    const final = store.getState()
    expect(final.editor.selectedComponentId).toBeNull()
    expect(final.authoritative.scene).toBe(initial.authoritative.scene)
    expect(final.authoritative.revision).toBe(0)
    expect(final.derived.trace).toBe(initial.derived.trace)
  })

  it('changes snap preference without moving components or retracing', () => {
    const store = createStudioStore()
    const initial = store.getState()

    initial.setSnapEnabled(false)
    const changed = store.getState()

    expect(changed.editor.snapEnabled).toBe(false)
    expect(changed.authoritative.scene).toBe(initial.authoritative.scene)
    expect(changed.derived.trace).toBe(initial.derived.trace)
  })

  it('immutably updates one stable component transform and recomputes trace', () => {
    const store = createStudioStore()
    const initial = store.getState()
    const mirrorIndex = initial.authoritative.scene.components.findIndex(
      ({ type }) => type === 'mirror',
    )
    const mirror = initial.authoritative.scene.components[mirrorIndex]
    const unrelatedLaser = initial.authoritative.scene.components.find(
      ({ type }) => type === 'laser',
    )
    expect(mirror).toBeDefined()
    expect(unrelatedLaser).toBeDefined()
    if (!mirror || !unrelatedLaser) return

    initial.updateComponentTransform(mirror.id, Transform2DSchema.parse({
      ...mirror.transform,
      x_mm: 225,
      rotation_deg: 0,
    }))
    const changed = store.getState()
    const changedMirror = changed.authoritative.scene.components[mirrorIndex]

    expect(changedMirror.id).toBe(mirror.id)
    expect(changedMirror.transform).toEqual({
      x_mm: 225,
      y_mm: mirror.transform.y_mm,
      rotation_deg: 0,
    })
    expect(changedMirror.parameters).toBe(mirror.parameters)
    expect(
      changed.authoritative.scene.components.find(
        ({ id }) => id === unrelatedLaser.id,
      ),
    ).toBe(unrelatedLaser)
    expect(changed.authoritative.revision).toBe(1)
    expect(changed.derived.sceneRevision).toBe(1)
    expect(changed.derived.trace).not.toBe(initial.derived.trace)
  })

  it('breaks and restores the default detector path through authoritative edits', () => {
    const store = createStudioStore()
    const mirror = store
      .getState()
      .authoritative.scene.components.find(({ type }) => type === 'mirror')
    expect(mirror).toBeDefined()
    if (!mirror) return
    const isDetected = () =>
      store
        .getState()
        .derived.trace.events.some(
          (event) => event.kind === 'termination' && event.reason === 'detected',
        )

    expect(isDetected()).toBe(true)
    store.getState().updateComponentTransform(mirror.id, Transform2DSchema.parse({
      ...mirror.transform,
      rotation_deg: 0,
    }))
    expect(isDetected()).toBe(false)
    store.getState().updateComponentTransform(mirror.id, mirror.transform)
    expect(isDetected()).toBe(true)
  })

  it('allows disabled components to remain selectable and transform-editable', () => {
    const disabledScene = OpticalSceneSchema.parse({
      ...DEFAULT_RAMAN_SCENE,
      components: DEFAULT_RAMAN_SCENE.components.map((component) =>
        component.type === 'mirror'
          ? { ...component, enabled: false }
          : component,
      ),
    })
    const store = createStudioStore(disabledScene)
    const mirror = store
      .getState()
      .authoritative.scene.components.find(({ type }) => type === 'mirror')
    expect(mirror).toBeDefined()
    if (!mirror) return

    store.getState().setSelection(mirror.id)
    store.getState().updateComponentTransform(
      mirror.id,
      Transform2DSchema.parse({
        ...mirror.transform,
        x_mm: mirror.transform.x_mm + 1,
      }),
    )

    const changedMirror = store
      .getState()
      .authoritative.scene.components.find(({ id }) => id === mirror.id)
    expect(store.getState().editor.selectedComponentId).toBe(mirror.id)
    expect(changedMirror?.enabled).toBe(false)
    expect(changedMirror?.transform.x_mm).toBe(mirror.transform.x_mm + 1)
  })
})
