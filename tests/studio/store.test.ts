import { describe, expect, it } from 'vitest'
import { OpticalSceneSchema } from '../../src/core/optics'
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

    expect(state.editor.selectedComponentIds).toEqual([])
    expect('trace' in state.authoritative).toBe(false)
    expect('setTrace' in state).toBe(false)
    expect(serializedScene).not.toContain('selectedComponentIds')
    expect(serializedScene).not.toMatch(/(?:x|y|width|height)_px/)
  })
})
