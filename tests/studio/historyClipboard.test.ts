import { describe, expect, it } from 'vitest'
import { Transform2DSchema } from '../../src/core/optics'
import { DEFAULT_RAMAN_SCENE } from '../../src/project/defaults/defaultRamanScene'
import { createStudioStore, STUDIO_HISTORY_LIMIT } from '../../src/store/studioStore'

const fixtureComponents = () => {
  const laser = DEFAULT_RAMAN_SCENE.components.find(({ type }) => type === 'laser')
  const mirror = DEFAULT_RAMAN_SCENE.components.find(({ type }) => type === 'mirror')
  const sample = DEFAULT_RAMAN_SCENE.components.find(({ type }) => type === 'sample')
  if (!laser || !mirror || !sample) throw new Error('Fixture is incomplete.')
  return { laser, mirror, sample }
}

describe('Studio history and editor clipboard', () => {
  it('keeps selection/view/copy outside history and copy outside retracing', () => {
    const store = createStudioStore()
    const { laser, mirror } = fixtureComponents()
    const initial = store.getState()

    initial.setSelection(mirror.id)
    store.getState().setSelection(laser.id, 'toggle')
    store.getState().panView({ x_px: 20, y_px: -10 })
    store.getState().setGridVisible(false)
    store.getState().setSnapEnabled(false)
    const beforeCopy = store.getState()
    expect(beforeCopy.copySelection()).toBe(true)
    const copied = store.getState()

    expect(copied.history.past).toHaveLength(0)
    expect(copied.authoritative.scene).toBe(initial.authoritative.scene)
    expect(copied.authoritative.revision).toBe(0)
    expect(copied.derived.trace).toBe(initial.derived.trace)
    expect(copied.editor.clipboard?.components).toHaveLength(2)
    expect(copied.editor.clipboard?.components.every((component) => !('id' in component))).toBe(true)
  })

  it('pastes complete components once, offsets in world mm, and redoes exact IDs', () => {
    const store = createStudioStore()
    const { laser, mirror } = fixtureComponents()
    store.getState().setSelection(mirror.id)
    store.getState().setSelection(laser.id, 'toggle')
    store.getState().copySelection()
    const traceBeforePaste = store.getState().derived.trace

    const pastedIds = store.getState().pasteClipboard()
    const pastedState = store.getState()
    expect(pastedIds).toEqual(['component:studio:000001', 'component:studio:000002'])
    expect(pastedState.editor.selectedComponentIds).toEqual(pastedIds)
    expect(pastedState.editor.primaryComponentId).toBe(pastedIds[1])
    expect(pastedState.history.past).toHaveLength(1)
    expect(pastedState.derived.trace).not.toBe(traceBeforePaste)

    const pasted = pastedState.authoritative.scene.components.slice(-2)
    expect(pasted.map(({ type }) => type)).toEqual([laser.type, mirror.type])
    expect(pasted[0]?.transform).toEqual({
      ...laser.transform,
      x_mm: laser.transform.x_mm + 25,
      y_mm: laser.transform.y_mm + 25,
    })
    expect(pasted[0]?.parameters).toEqual(laser.parameters)
    expect(pasted[0]?.geometry).toEqual(laser.geometry)
    expect(pasted[0]?.visualization).toEqual(laser.visualization)

    expect(pastedState.undo()).toBe(true)
    expect(store.getState().authoritative.scene.components.some(({ id }) => pastedIds.includes(id))).toBe(false)
    expect(store.getState().editor.selectedComponentIds).toEqual([])
    expect(store.getState().editor.clipboard).toBe(pastedState.editor.clipboard)

    expect(store.getState().redo()).toBe(true)
    expect(store.getState().authoritative.scene.components.slice(-2).map(({ id }) => id)).toEqual(pastedIds)
  })

  it('duplicates without mutating clipboard and deletes/restores a group in one step', () => {
    const store = createStudioStore()
    const { mirror, sample } = fixtureComponents()
    store.getState().setSelection(mirror.id)
    store.getState().copySelection()
    const clipboard = store.getState().editor.clipboard
    store.getState().setSelection(sample.id, 'toggle')

    const duplicated = store.getState().duplicateSelection()
    expect(duplicated).toHaveLength(2)
    expect(store.getState().editor.clipboard).toBe(clipboard)
    expect(store.getState().history.past).toHaveLength(1)

    expect(store.getState().deleteSelectedComponents()).toBe(true)
    expect(store.getState().history.past).toHaveLength(2)
    expect(store.getState().editor.selectedComponentIds).toEqual([])
    expect(store.getState().undo()).toBe(true)
    expect(store.getState().authoritative.scene.components.slice(-2).map(({ id }) => id)).toEqual(duplicated)
  })

  it('groups live pointer-style updates into one transaction and cancels cleanly', () => {
    const store = createStudioStore()
    const { laser, mirror } = fixtureComponents()
    const initialScene = store.getState().authoritative.scene
    store.getState().beginHistoryTransaction('Move components')
    for (const delta of [1, 2, 3]) {
      store.getState().updateComponentTransforms([
        {
          componentId: laser.id,
          transform: Transform2DSchema.parse({ ...laser.transform, x_mm: laser.transform.x_mm + delta }),
        },
        {
          componentId: mirror.id,
          transform: Transform2DSchema.parse({ ...mirror.transform, x_mm: mirror.transform.x_mm + delta }),
        },
      ])
    }
    expect(store.getState().history.past).toHaveLength(0)
    expect(store.getState().commitHistoryTransaction()).toBe(true)
    expect(store.getState().history.past).toHaveLength(1)
    expect(store.getState().undo()).toBe(true)
    expect(store.getState().authoritative.scene).toBe(initialScene)

    const sceneBeforeCancel = store.getState().authoritative.scene
    store.getState().beginHistoryTransaction('Move component')
    store.getState().updateComponentTransform(
      mirror.id,
      Transform2DSchema.parse({ ...mirror.transform, y_mm: mirror.transform.y_mm + 10 }),
    )
    expect(store.getState().cancelHistoryTransaction()).toBe(true)
    expect(store.getState().authoritative.scene).toBe(sceneBeforeCancel)
    expect(store.getState().history.past).toHaveLength(0)
  })

  it('does not create a transaction entry when the final design returns to its start', () => {
    const store = createStudioStore()
    const { mirror } = fixtureComponents()
    store.getState().beginHistoryTransaction('Move component')
    store.getState().updateComponentTransform(
      mirror.id,
      Transform2DSchema.parse({ ...mirror.transform, x_mm: mirror.transform.x_mm + 5 }),
    )
    store.getState().updateComponentTransform(mirror.id, mirror.transform)

    expect(store.getState().commitHistoryTransaction()).toBe(false)
    expect(store.getState().history.past).toHaveLength(0)
  })

  it('invalidates redo only on a new design mutation and preserves editor/view state on undo', () => {
    const store = createStudioStore()
    const { mirror } = fixtureComponents()
    store.getState().updateComponentCommon(mirror.id, { name: 'A' })
    store.getState().undo()
    expect(store.getState().history.future).toHaveLength(1)

    store.getState().setSelection(mirror.id)
    store.getState().setGridVisible(false)
    store.getState().setSnapEnabled(false)
    store.getState().panView({ x_px: 50, y_px: 20 })
    store.getState().copySelection()
    const view = store.getState().view
    const clipboard = store.getState().editor.clipboard
    expect(store.getState().history.future).toHaveLength(1)
    expect(store.getState().redo()).toBe(true)
    expect(store.getState().view).toBe(view)
    expect(store.getState().editor.clipboard).toBe(clipboard)

    store.getState().undo()
    store.getState().updateComponentCommon(mirror.id, { name: 'B' })
    expect(store.getState().history.future).toHaveLength(0)
  })

  it('never backs up the ID allocator high-water mark across undo', () => {
    const store = createStudioStore()
    const first = store.getState().addComponent('mirror', { x: 0, y: 0 })
    store.getState().undo()
    const second = store.getState().addComponent('mirror', { x: 0, y: 0 })
    expect(first).toBe('component:studio:000001')
    expect(second).toBe('component:studio:000002')
  })

  it('bounds history deterministically', () => {
    const store = createStudioStore()
    const { mirror } = fixtureComponents()
    for (let index = 0; index < STUDIO_HISTORY_LIMIT + 5; index += 1) {
      store.getState().updateComponentCommon(mirror.id, { name: `Mirror ${index}` })
    }
    expect(store.getState().history.past).toHaveLength(STUDIO_HISTORY_LIMIT)
    expect(store.getState().history.past[0]?.afterScene.components.find(({ id }) => id === mirror.id)?.name)
      .toBe('Mirror 5')
  })
})
