import { describe, expect, it } from 'vitest'
import {
  ComponentIdSchema,
  OpticalSceneSchema,
  Transform2DSchema,
  type OpticalComponent,
  type OpticalComponentType,
} from '../../src/core/optics'
import { createStudioComponent } from '../../src/project/components/componentDefinitions'
import { DEFAULT_RAMAN_SCENE } from '../../src/project/defaults/defaultRamanScene'
import { createStudioStore } from '../../src/store/studioStore'

const component = (
  suffix: string,
  type: OpticalComponentType,
  x_mm: number,
  y_mm: number,
): OpticalComponent => ({
  ...createStudioComponent(
    type,
    ComponentIdSchema.parse(`component:phase2e:${suffix}`),
    { x: x_mm, y: y_mm },
  ),
  transform: Transform2DSchema.parse({ x_mm, y_mm, rotation_deg: 17 }),
}) as OpticalComponent

const commandScene = (reverse = false) => {
  const components = [
    component('a', 'laser', 0, 0),
    component('b', 'mirror', 10, 20),
    component('c', 'sample', 30, -10),
    component('d', 'filter', 40, 10),
  ]
  return OpticalSceneSchema.parse({
    breadboards: [],
    components: reverse ? [...components].reverse() : components,
  })
}

const selectAll = (store: ReturnType<typeof createStudioStore>) => {
  store.getState().setSelectionIds(
    store.getState().authoritative.scene.components.map(({ id }) => id),
  )
}

const transformsById = (components: readonly OpticalComponent[]) =>
  Object.fromEntries(components.map(({ id, transform }) => [id, transform]))

describe('Phase 2E locking contract', () => {
  it('keeps lock editor-only, selectable, trace-participating, and out of history', () => {
    const store = createStudioStore()
    const mirror = store.getState().authoritative.scene.components.find(({ type }) => type === 'mirror')!
    const initial = store.getState()
    initial.setSelection(mirror.id)
    expect(store.getState().setComponentLocked(mirror.id, true)).toBe(true)
    const locked = store.getState()

    expect(locked.editor.selectedComponentIds).toEqual([mirror.id])
    expect(locked.editor.lockedComponentIds).toEqual([mirror.id])
    expect(locked.authoritative.scene).toBe(initial.authoritative.scene)
    expect(locked.authoritative.revision).toBe(0)
    expect(locked.derived.trace).toBe(initial.derived.trace)
    expect(locked.history.past).toHaveLength(0)
    expect(
      locked.derived.trace.events.some(
        (event) => event.kind === 'component-interaction' && event.componentId === mirror.id,
      ),
    ).toBe(true)
    expect(locked.setComponentLocked(mirror.id, false)).toBe(true)
    expect(store.getState().editor.lockedComponentIds).toEqual([])
  })

  it('blocks every design mutation and delete path for locked components', () => {
    const store = createStudioStore()
    const mirror = store.getState().authoritative.scene.components.find(({ type }) => type === 'mirror')!
    store.getState().setComponentLocked(mirror.id, true)
    const before = store.getState()

    expect(() => before.updateComponentTransform(
      mirror.id,
      Transform2DSchema.parse({ ...mirror.transform, x_mm: mirror.transform.x_mm + 1 }),
    )).toThrow(/locked/)
    expect(() => before.updateComponentCommon(mirror.id, { name: 'Blocked' })).toThrow(/locked/)
    expect(() => before.updateComponentCommon(mirror.id, { enabled: false })).toThrow(/locked/)
    expect(() => before.updateComponentGeometry(mirror.id, mirror.geometry.aperture_mm + 1)).toThrow(/locked/)
    expect(() => before.updateComponentParameters(mirror.id, { reflectivity: 0.5 })).toThrow(/locked/)
    expect(before.deleteComponent(mirror.id)).toBe(false)
    expect(store.getState().authoritative.scene).toBe(before.authoritative.scene)
    expect(store.getState().history.past).toHaveLength(0)
  })

  it('protects locked members during multi-delete and all-or-nothing transform updates', () => {
    const store = createStudioStore()
    const mirror = store.getState().authoritative.scene.components.find(({ type }) => type === 'mirror')!
    const sample = store.getState().authoritative.scene.components.find(({ type }) => type === 'sample')!
    store.getState().setSelectionIds([mirror.id, sample.id])
    store.getState().setComponentLocked(mirror.id, true)
    expect(() => store.getState().updateComponentTransforms([
      {
        componentId: mirror.id,
        transform: Transform2DSchema.parse({ ...mirror.transform, x_mm: 999 }),
      },
      {
        componentId: sample.id,
        transform: Transform2DSchema.parse({ ...sample.transform, x_mm: 999 }),
      },
    ])).toThrow(/locked/)
    expect(store.getState().deleteSelectedComponents()).toBe(true)

    const state = store.getState()
    expect(state.authoritative.scene.components.some(({ id }) => id === mirror.id)).toBe(true)
    expect(state.authoritative.scene.components.some(({ id }) => id === sample.id)).toBe(false)
    expect(state.editor.selectedComponentIds).toEqual([mirror.id])
    expect(state.editor.primaryComponentId).toBe(mirror.id)
  })

  it('copies locked components but creates added, pasted, and duplicated components unlocked', () => {
    const store = createStudioStore()
    const mirror = store.getState().authoritative.scene.components.find(({ type }) => type === 'mirror')!
    store.getState().setSelection(mirror.id)
    store.getState().setComponentLocked(mirror.id, true)
    expect(store.getState().copySelection()).toBe(true)
    expect(store.getState().editor.clipboard?.components[0]).not.toHaveProperty('locked')

    const pasted = store.getState().pasteClipboard()
    expect(pasted).toHaveLength(1)
    expect(store.getState().editor.lockedComponentIds).toEqual([mirror.id])
    store.getState().setSelection(mirror.id)
    const duplicated = store.getState().duplicateSelection()
    const added = store.getState().addComponent('pinhole', { x: 1, y: 2 })
    for (const id of [...pasted, ...duplicated, added]) {
      expect(store.getState().editor.lockedComponentIds).not.toContain(id)
    }
  })
})

describe('Phase 2E align commands', () => {
  it.each([
    ['left', 'x_mm', 0],
    ['right', 'x_mm', 40],
    ['horizontal-center', 'x_mm', 20],
    ['top', 'y_mm', 20],
    ['bottom', 'y_mm', -10],
    ['vertical-center', 'y_mm', 5],
  ] as const)('aligns %s with +Y-up world-center semantics', (alignment, key, expected) => {
    const store = createStudioStore(commandScene())
    selectAll(store)
    const ids = store.getState().authoritative.scene.components.map(({ id }) => id)
    expect(store.getState().alignSelectedComponents(alignment)).toBe(true)
    const state = store.getState()
    expect(state.authoritative.scene.components.map(({ transform }) => transform[key])).toEqual(
      ids.map(() => expected),
    )
    expect(state.authoritative.scene.components.map(({ id }) => id)).toEqual(ids)
    expect(state.history.past).toHaveLength(1)
  })

  it('leaves locked components stationary and skips no-op commands without history', () => {
    const store = createStudioStore(commandScene())
    selectAll(store)
    const locked = store.getState().authoritative.scene.components.at(-1)!
    store.getState().setComponentLocked(locked.id, true)
    expect(store.getState().alignSelectedComponents('left')).toBe(true)
    expect(
      store.getState().authoritative.scene.components.find(({ id }) => id === locked.id)?.transform,
    ).toEqual(locked.transform)
    expect(store.getState().history.past).toHaveLength(1)

    const alreadyAligned = OpticalSceneSchema.parse({
      breadboards: [],
      components: commandScene().components.map((candidate) => ({
        ...candidate,
        transform: { ...candidate.transform, x_mm: 0 },
      })),
    })
    const noOpStore = createStudioStore(alreadyAligned)
    selectAll(noOpStore)
    expect(noOpStore.getState().alignSelectedComponents('left')).toBe(false)
    expect(noOpStore.getState().history.past).toHaveLength(0)
  })

  it('undoes and redoes one exact align operation with stable IDs', () => {
    const store = createStudioStore(commandScene())
    selectAll(store)
    const before = transformsById(store.getState().authoritative.scene.components)
    const ids = store.getState().authoritative.scene.components.map(({ id }) => id)
    store.getState().alignSelectedComponents('top')
    const after = transformsById(store.getState().authoritative.scene.components)
    expect(store.getState().undo()).toBe(true)
    expect(transformsById(store.getState().authoritative.scene.components)).toEqual(before)
    expect(store.getState().redo()).toBe(true)
    expect(transformsById(store.getState().authoritative.scene.components)).toEqual(after)
    expect(store.getState().authoritative.scene.components.map(({ id }) => id)).toEqual(ids)
  })
})

describe('Phase 2E distribution commands', () => {
  const sceneWithPositions = (
    positions: readonly (readonly [string, number, number])[],
    reverse = false,
  ) => {
    const components = positions.map(([suffix, x, y], index) =>
      component(suffix, (['laser', 'mirror', 'sample', 'filter'][index] ?? 'pinhole') as OpticalComponentType, x, y),
    )
    return OpticalSceneSchema.parse({ breadboards: [], components: reverse ? [...components].reverse() : components })
  }

  it('distributes horizontal and vertical centers equally with fixed anchors', () => {
    const horizontal = createStudioStore(sceneWithPositions([
      ['a', 0, 0], ['b', 3, 7], ['c', 11, -4], ['d', 30, 9],
    ]))
    selectAll(horizontal)
    expect(horizontal.getState().distributeSelectedComponents('horizontal')).toBe(true)
    expect(horizontal.getState().authoritative.scene.components.map(({ transform }) => transform.x_mm)).toEqual([0, 10, 20, 30])

    const vertical = createStudioStore(sceneWithPositions([
      ['a', 4, -10], ['b', 8, -2], ['c', 12, 20],
    ]))
    selectAll(vertical)
    expect(vertical.getState().distributeSelectedComponents('vertical')).toBe(true)
    expect(vertical.getState().authoritative.scene.components.map(({ transform }) => transform.y_mm)).toEqual([-10, 5, 20])
  })

  it('uses stable-ID tie breaks and is independent from component array order', () => {
    const positions = [
      ['a', 0, 0], ['b', 0, 0], ['c', 20, 0], ['d', 30, 0],
    ] as const
    const forward = createStudioStore(sceneWithPositions(positions))
    const reversed = createStudioStore(sceneWithPositions(positions, true))
    selectAll(forward)
    selectAll(reversed)
    forward.getState().distributeSelectedComponents('horizontal')
    reversed.getState().distributeSelectedComponents('horizontal')

    const xById = (store: ReturnType<typeof createStudioStore>) =>
      Object.fromEntries(store.getState().authoritative.scene.components.map(({ id, transform }) => [id, transform.x_mm]))
    expect(xById(forward)).toEqual(xById(reversed))
    expect(xById(forward)).toEqual({
      'component:phase2e:a': 0,
      'component:phase2e:b': 10,
      'component:phase2e:c': 20,
      'component:phase2e:d': 30,
    })
  })

  it('requires three eligible components and never moves a locked member', () => {
    const tooFew = createStudioStore(sceneWithPositions([['a', 0, 0], ['b', 10, 0]]))
    selectAll(tooFew)
    expect(tooFew.getState().distributeSelectedComponents('horizontal')).toBe(false)
    expect(tooFew.getState().history.past).toHaveLength(0)

    const mixed = createStudioStore(sceneWithPositions([
      ['a', 0, 0], ['b', 5, 0], ['c', 10, 0], ['d', 40, 0],
    ]))
    selectAll(mixed)
    const locked = mixed.getState().authoritative.scene.components[1]!
    mixed.getState().setComponentLocked(locked.id, true)
    expect(mixed.getState().distributeSelectedComponents('horizontal')).toBe(true)
    expect(mixed.getState().authoritative.scene.components.find(({ id }) => id === locked.id)?.transform.x_mm).toBe(5)
    expect(mixed.getState().authoritative.scene.components.find(({ id }) => id.endsWith(':c'))?.transform.x_mm).toBe(20)
    expect(mixed.getState().history.past).toHaveLength(1)
  })

  it('undoes and redoes one distribution entry without changing IDs or locked transforms', () => {
    const store = createStudioStore(sceneWithPositions([
      ['a', 0, 0], ['b', 4, 0], ['c', 18, 0], ['d', 30, 0],
    ]))
    selectAll(store)
    const locked = store.getState().authoritative.scene.components[1]!
    store.getState().setComponentLocked(locked.id, true)
    const ids = store.getState().authoritative.scene.components.map(({ id }) => id)
    const before = transformsById(store.getState().authoritative.scene.components)
    store.getState().distributeSelectedComponents('horizontal')
    const after = transformsById(store.getState().authoritative.scene.components)
    expect(store.getState().history.past).toHaveLength(1)
    expect(store.getState().undo()).toBe(true)
    expect(transformsById(store.getState().authoritative.scene.components)).toEqual(before)
    expect(store.getState().redo()).toBe(true)
    expect(transformsById(store.getState().authoritative.scene.components)).toEqual(after)
    expect(store.getState().authoritative.scene.components.map(({ id }) => id)).toEqual(ids)
    expect(after[locked.id]?.x_mm).toBe(locked.transform.x_mm)
  })
})

describe('Phase 2E scene replacement reconciliation', () => {
  it('cleans stale selection/locks, clears history, preserves camera/clipboard, and signals gestures', () => {
    const store = createStudioStore()
    const mirror = store.getState().authoritative.scene.components.find(({ type }) => type === 'mirror')!
    const laser = store.getState().authoritative.scene.components.find(({ type }) => type === 'laser')!
    store.getState().setSelectionIds([mirror.id, laser.id])
    store.getState().setComponentLocked(mirror.id, true)
    store.getState().copySelection()
    store.getState().panView({ x_px: 33, y_px: -11 })
    store.getState().updateComponentCommon(laser.id, { name: 'History marker' })
    store.getState().beginHistoryTransaction('Interrupted move')
    const before = store.getState()
    const replacement = OpticalSceneSchema.parse({
      ...DEFAULT_RAMAN_SCENE,
      components: DEFAULT_RAMAN_SCENE.components.filter(({ id }) => id !== mirror.id),
    })
    before.replaceScene(replacement)
    const after = store.getState()

    expect(after.editor.selectedComponentIds).toEqual([laser.id])
    expect(after.editor.primaryComponentId).toBe(laser.id)
    expect(after.editor.lockedComponentIds).toEqual([])
    expect(after.editor.sceneReplacementRevision).toBe(before.editor.sceneReplacementRevision + 1)
    expect(after.history.past).toEqual([])
    expect(after.history.activeTransaction).toBeNull()
    expect(after.view.camera).toBe(before.view.camera)
    expect(after.editor.clipboard).toBe(before.editor.clipboard)
    expect(after.derived.sceneRevision).toBe(after.authoritative.revision)
  })

  it('cleans stale locks after undo removes a newly added component', () => {
    const store = createStudioStore()
    const id = store.getState().addComponent('mirror', { x: 1, y: 2 })
    store.getState().setComponentLocked(id, true)
    expect(store.getState().undo()).toBe(true)
    expect(store.getState().editor.lockedComponentIds).toEqual([])
    expect(store.getState().editor.primaryComponentId).toBeNull()
  })
})
