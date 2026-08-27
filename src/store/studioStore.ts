import { useStore } from 'zustand'
import { createStore, type StoreApi } from 'zustand/vanilla'
import {
  OpticalComponentSchema,
  OpticalSceneSchema,
  SimulationConfigurationSchema,
  Transform2DSchema,
  traceOpticalScene,
  type ComponentId,
  type OpticalComponent,
  type OpticalComponentType,
  type OpticalScene,
  type SimulationConfiguration,
  type TraceResult,
  type Transform2D,
  type Vec2,
} from '../core/optics'
import {
  createViewportSize,
  fitWorldBounds,
  panCamera,
  zoomCameraAtScreenPoint,
  type Camera2D,
  type ScreenPoint,
  type ViewportSize,
} from '../features/studio/camera'
import {
  EMPTY_STUDIO_SELECTION,
  reconcileSelection,
  updateSelection,
  updateSelectionSet,
  unlockedSelectedComponents,
  type SelectionMode,
  type StudioSelection,
} from '../features/studio/editorSelection'
import { getSceneWorldBounds } from '../features/studio/sceneBounds'
import {
  COMPONENT_EDITABILITY_POLICY,
  createAlignmentUpdates,
  createDistributionUpdates,
  normalizeEditorAngleDeg,
  type StudioAlignment,
  type StudioDistribution,
} from '../features/studio/editorMath'
import {
  createComponentIdAllocator,
  createStudioComponent,
} from '../project/components/componentDefinitions'
import {
  DEFAULT_RAMAN_SCENE,
  DEFAULT_SIMULATION_CONFIGURATION,
} from '../project/defaults/defaultRamanScene'

export const STUDIO_HISTORY_LIMIT = 100

export interface StudioAuthoritativeState {
  readonly scene: OpticalScene
  readonly simulationConfiguration: SimulationConfiguration
  readonly revision: number
}

export type ClipboardComponent = Omit<OpticalComponent, 'id'>

export interface StudioClipboard {
  /** Components are stored in their source scene order and never carry IDs. */
  readonly components: readonly ClipboardComponent[]
}

export interface StudioEditorState extends StudioSelection {
  readonly snapEnabled: boolean
  readonly clipboard: StudioClipboard | null
  /** Editor-only lock policy; never changes optical physics or project schema. */
  readonly lockedComponentIds: readonly ComponentId[]
  /** Changes only for an authoritative whole-scene replacement. */
  readonly sceneReplacementRevision: number
}

export interface StudioViewState {
  readonly camera: Camera2D
  readonly viewport: ViewportSize
  readonly viewportMeasured: boolean
  readonly gridVisible: boolean
}

export interface StudioDerivedState {
  readonly trace: TraceResult
  readonly sceneRevision: number
}

export interface StudioHistoryEntry {
  readonly label: string
  readonly beforeScene: OpticalScene
  readonly afterScene: OpticalScene
}

export interface StudioHistoryTransaction {
  readonly label: string
  readonly beforeScene: OpticalScene
}

export interface StudioHistoryState {
  readonly past: readonly StudioHistoryEntry[]
  readonly future: readonly StudioHistoryEntry[]
  readonly activeTransaction: StudioHistoryTransaction | null
}

export interface ComponentTransformUpdate {
  readonly componentId: ComponentId
  readonly transform: Transform2D
}

export interface StudioState {
  readonly authoritative: StudioAuthoritativeState
  readonly editor: StudioEditorState
  readonly view: StudioViewState
  readonly derived: StudioDerivedState
  readonly history: StudioHistoryState
  readonly replaceScene: (scene: OpticalScene) => void
  readonly setSelection: (componentId: ComponentId | null, mode?: SelectionMode) => void
  readonly setSelectionIds: (componentIds: readonly ComponentId[], mode?: SelectionMode) => void
  readonly setSnapEnabled: (enabled: boolean) => void
  readonly setComponentLocked: (componentId: ComponentId, locked: boolean) => boolean
  readonly setSelectedComponentsLocked: (locked: boolean) => boolean
  readonly alignSelectedComponents: (alignment: StudioAlignment) => boolean
  readonly distributeSelectedComponents: (axis: StudioDistribution) => boolean
  readonly addComponent: (type: OpticalComponentType, position_mm: Vec2) => ComponentId
  readonly deleteComponent: (componentId: ComponentId) => boolean
  readonly deleteSelectedComponents: () => boolean
  readonly copySelection: () => boolean
  readonly pasteClipboard: () => readonly ComponentId[]
  readonly duplicateSelection: () => readonly ComponentId[]
  readonly beginHistoryTransaction: (label: string) => void
  readonly commitHistoryTransaction: () => boolean
  readonly cancelHistoryTransaction: () => boolean
  readonly undo: () => boolean
  readonly redo: () => boolean
  readonly updateComponentCommon: (
    componentId: ComponentId,
    patch: { readonly name?: string; readonly enabled?: boolean },
  ) => void
  readonly updateComponentTransform: (componentId: ComponentId, transform: Transform2D) => void
  readonly updateComponentTransforms: (updates: readonly ComponentTransformUpdate[]) => void
  readonly updateComponentGeometry: (componentId: ComponentId, aperture_mm: number) => void
  readonly updateComponentParameters: (
    componentId: ComponentId,
    parameters: Readonly<Record<string, unknown>>,
  ) => void
  readonly setGridVisible: (visible: boolean) => void
  readonly setViewportSize: (width_px: number, height_px: number) => void
  readonly panView: (delta_px: ScreenPoint) => void
  readonly zoomViewAt: (anchor_px: ScreenPoint, factor: number) => void
  readonly resetView: () => void
}

export type StudioStore = StoreApi<StudioState>

const INITIAL_VIEWPORT = createViewportSize(1200, 720)
const EMPTY_HISTORY: StudioHistoryState = Object.freeze({
  past: Object.freeze([]),
  future: Object.freeze([]),
  activeTransaction: null,
})

const primitiveRecordsEqual = (
  left: Readonly<Record<string, unknown>>,
  right: Readonly<Record<string, unknown>>,
): boolean => {
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  return leftKeys.length === rightKeys.length && leftKeys.every((key) => left[key] === right[key])
}

const scenesHaveEqualDesign = (left: OpticalScene, right: OpticalScene): boolean =>
  left === right || JSON.stringify(left) === JSON.stringify(right)

const editorWithSelection = (
  editor: StudioEditorState,
  selection: StudioSelection,
): StudioEditorState =>
  Object.freeze({
    ...editor,
    selectedComponentIds: selection.selectedComponentIds,
    primaryComponentId: selection.primaryComponentId,
  })

const sceneOrderedLockedIds = (
  scene: OpticalScene,
  lockedComponentIds: readonly ComponentId[],
): readonly ComponentId[] => {
  const locked = new Set(lockedComponentIds)
  return Object.freeze(
    scene.components.filter(({ id }) => locked.has(id)).map(({ id }) => id),
  )
}

const reconcileEditorWithScene = (
  editor: StudioEditorState,
  scene: OpticalScene,
): StudioEditorState => {
  const selection = reconcileSelection(
    scene,
    editor.selectedComponentIds,
    editor.primaryComponentId,
  )
  return Object.freeze({
    ...editor,
    selectedComponentIds: selection.selectedComponentIds,
    primaryComponentId: selection.primaryComponentId,
    lockedComponentIds: sceneOrderedLockedIds(scene, editor.lockedComponentIds),
  })
}

const appendBounded = (
  entries: readonly StudioHistoryEntry[],
  entry: StudioHistoryEntry,
): readonly StudioHistoryEntry[] =>
  Object.freeze([...entries, entry].slice(-STUDIO_HISTORY_LIMIT))

const componentWithoutId = (component: OpticalComponent): ClipboardComponent => {
  const { id, ...copy } = component
  void id
  return copy
}

export const createStudioStore = (
  initialScene: OpticalScene = DEFAULT_RAMAN_SCENE,
  simulationConfiguration: SimulationConfiguration = DEFAULT_SIMULATION_CONFIGURATION,
): StudioStore => {
  const scene = OpticalSceneSchema.parse(initialScene)
  const validatedConfiguration = SimulationConfigurationSchema.parse(simulationConfiguration)
  const idAllocator = createComponentIdAllocator(scene)
  const initialCamera = fitWorldBounds(getSceneWorldBounds(scene), INITIAL_VIEWPORT)

  return createStore<StudioState>()((set, get) => {
    const commitScene = (
      current: StudioState,
      nextScene: OpticalScene,
      retrace: boolean,
      label: string,
      editor: StudioEditorState = current.editor,
    ) => {
      const revision = current.authoritative.revision + 1
      const trace = retrace
        ? traceOpticalScene(nextScene, current.authoritative.simulationConfiguration)
        : current.derived.trace
      const history = current.history.activeTransaction
        ? current.history
        : Object.freeze({
            past: appendBounded(current.history.past, {
              label,
              beforeScene: current.authoritative.scene,
              afterScene: nextScene,
            }),
            future: Object.freeze([]),
            activeTransaction: null,
          })
      set({
        authoritative: Object.freeze({ ...current.authoritative, scene: nextScene, revision }),
        derived: Object.freeze({ trace, sceneRevision: revision }),
        editor,
        history,
      })
    }

    const restoreScene = (
      current: StudioState,
      nextScene: OpticalScene,
      history: StudioHistoryState,
    ) => {
      idAllocator.observe(nextScene)
      const revision = current.authoritative.revision + 1
      set({
        authoritative: Object.freeze({ ...current.authoritative, scene: nextScene, revision }),
        derived: Object.freeze({
          trace: traceOpticalScene(nextScene, current.authoritative.simulationConfiguration),
          sceneRevision: revision,
        }),
        editor: reconcileEditorWithScene(current.editor, nextScene),
        history,
      })
    }

    const replaceOneComponent = (
      componentId: ComponentId,
      replacement: OpticalComponent,
      retrace: boolean,
      label: string,
    ) => {
      const current = get()
      if (current.editor.lockedComponentIds.includes(componentId)) {
        throw new RangeError(`Component is locked: ${componentId}`)
      }
      const componentIndex = current.authoritative.scene.components.findIndex(({ id }) => id === componentId)
      if (componentIndex < 0) throw new RangeError(`Unknown component ID: ${componentId}`)
      const components = current.authoritative.scene.components.map((candidate, index) =>
        index === componentIndex ? replacement : candidate,
      )
      commitScene(current, { ...current.authoritative.scene, components }, retrace, label)
    }

    const commitTransformCommand = (
      current: StudioState,
      updates: readonly ComponentTransformUpdate[],
      label: string,
    ): boolean => {
      if (updates.length === 0) return false
      const updateIds = new Set<ComponentId>()
      const validated = new Map<ComponentId, Transform2D>()
      const locked = new Set(current.editor.lockedComponentIds)
      for (const update of updates) {
        if (updateIds.has(update.componentId)) {
          throw new RangeError(`Duplicate transform update: ${update.componentId}`)
        }
        updateIds.add(update.componentId)
        const component = current.authoritative.scene.components.find(({ id }) => id === update.componentId)
        if (!component) throw new RangeError(`Unknown component ID: ${update.componentId}`)
        if (locked.has(update.componentId)) {
          throw new RangeError(`Component is locked: ${update.componentId}`)
        }
        if (!COMPONENT_EDITABILITY_POLICY[component.type].movable) {
          throw new RangeError(`Component is not transform-editable: ${update.componentId}`)
        }
        validated.set(
          update.componentId,
          Transform2DSchema.parse({
            ...update.transform,
            rotation_deg: normalizeEditorAngleDeg(update.transform.rotation_deg),
          }),
        )
      }
      let changed = false
      const components = current.authoritative.scene.components.map((component) => {
        const transform = validated.get(component.id)
        if (!transform) return component
        if (
          component.transform.x_mm === transform.x_mm &&
          component.transform.y_mm === transform.y_mm &&
          component.transform.rotation_deg === transform.rotation_deg
        ) return component
        changed = true
        return { ...component, transform } as OpticalComponent
      })
      if (!changed) return false
      commitScene(current, { ...current.authoritative.scene, components }, true, label)
      return true
    }

    const copyComponentsIntoScene = (
      sourceComponents: readonly ClipboardComponent[],
      label: string,
    ): readonly ComponentId[] => {
      if (sourceComponents.length === 0) return Object.freeze([])
      const current = get()
      const pitch_mm = current.authoritative.scene.breadboards[0]?.hole_pitch_mm ?? 25
      const created = sourceComponents.map((source) => {
        const id = idAllocator.next(current.authoritative.scene)
        return OpticalComponentSchema.parse({
          ...source,
          id,
          transform: {
            ...source.transform,
            x_mm: source.transform.x_mm + pitch_mm,
            y_mm: source.transform.y_mm + pitch_mm,
          },
        })
      })
      const nextScene: OpticalScene = {
        ...current.authoritative.scene,
        components: [...current.authoritative.scene.components, ...created],
      }
      const ids = Object.freeze(created.map(({ id }) => id))
      commitScene(
        current,
        nextScene,
        true,
        label,
        editorWithSelection(current.editor, {
          selectedComponentIds: ids,
          primaryComponentId: ids.at(-1) ?? null,
        }),
      )
      return ids
    }

    return {
      authoritative: Object.freeze({ scene, simulationConfiguration: validatedConfiguration, revision: 0 }),
      editor: Object.freeze({
        ...EMPTY_STUDIO_SELECTION,
        snapEnabled: true,
        clipboard: null,
        lockedComponentIds: Object.freeze([]),
        sceneReplacementRevision: 0,
      }),
      view: Object.freeze({
        camera: initialCamera,
        viewport: INITIAL_VIEWPORT,
        viewportMeasured: false,
        gridVisible: true,
      }),
      derived: Object.freeze({
        trace: traceOpticalScene(scene, validatedConfiguration),
        sceneRevision: 0,
      }),
      history: EMPTY_HISTORY,
      replaceScene: (nextScene) => {
        const validatedScene = OpticalSceneSchema.parse(nextScene)
        const current = get()
        const revision = current.authoritative.revision + 1
        idAllocator.observe(validatedScene)
        set({
          authoritative: Object.freeze({ ...current.authoritative, scene: validatedScene, revision }),
          derived: Object.freeze({
            trace: traceOpticalScene(validatedScene, current.authoritative.simulationConfiguration),
            sceneRevision: revision,
          }),
          editor: Object.freeze({
            ...reconcileEditorWithScene(current.editor, validatedScene),
            sceneReplacementRevision: current.editor.sceneReplacementRevision + 1,
          }),
          history: EMPTY_HISTORY,
        })
      },
      setSelection: (componentId, mode = 'replace') => {
        const current = get()
        const selection = updateSelection(
          current.authoritative.scene,
          current.editor,
          componentId,
          mode,
        )
        set({ editor: editorWithSelection(current.editor, selection) })
      },
      setSelectionIds: (componentIds, mode = 'replace') => {
        const current = get()
        const selection = updateSelectionSet(
          current.authoritative.scene,
          current.editor,
          componentIds,
          mode,
        )
        set({ editor: editorWithSelection(current.editor, selection) })
      },
      setSnapEnabled: (snapEnabled) =>
        set((state) => ({ editor: Object.freeze({ ...state.editor, snapEnabled }) })),
      setComponentLocked: (componentId, locked) => {
        const current = get()
        if (!current.authoritative.scene.components.some(({ id }) => id === componentId)) {
          throw new RangeError(`Unknown component ID: ${componentId}`)
        }
        const ids = new Set(current.editor.lockedComponentIds)
        const changed = locked ? !ids.has(componentId) : ids.has(componentId)
        if (!changed) return false
        if (locked) ids.add(componentId)
        else ids.delete(componentId)
        set({
          editor: Object.freeze({
            ...current.editor,
            lockedComponentIds: sceneOrderedLockedIds(current.authoritative.scene, [...ids]),
          }),
        })
        return true
      },
      setSelectedComponentsLocked: (locked) => {
        const current = get()
        if (current.editor.selectedComponentIds.length === 0) return false
        const ids = new Set(current.editor.lockedComponentIds)
        let changed = false
        for (const id of current.editor.selectedComponentIds) {
          if (locked ? !ids.has(id) : ids.has(id)) changed = true
          if (locked) ids.add(id)
          else ids.delete(id)
        }
        if (!changed) return false
        set({
          editor: Object.freeze({
            ...current.editor,
            lockedComponentIds: sceneOrderedLockedIds(current.authoritative.scene, [...ids]),
          }),
        })
        return true
      },
      alignSelectedComponents: (alignment) => {
        const current = get()
        const eligible = unlockedSelectedComponents(
          current.authoritative.scene,
          current.editor.selectedComponentIds,
          current.editor.lockedComponentIds,
        )
        const updates = createAlignmentUpdates(eligible, alignment).map(({ id, transform }) => ({
          componentId: id as ComponentId,
          transform,
        }))
        return commitTransformCommand(current, updates, `Align ${alignment}`)
      },
      distributeSelectedComponents: (axis) => {
        const current = get()
        const eligible = unlockedSelectedComponents(
          current.authoritative.scene,
          current.editor.selectedComponentIds,
          current.editor.lockedComponentIds,
        )
        const updates = createDistributionUpdates(eligible, axis).map(({ id, transform }) => ({
          componentId: id as ComponentId,
          transform,
        }))
        return commitTransformCommand(current, updates, `Distribute ${axis}`)
      },
      addComponent: (type, position_mm) => {
        const current = get()
        const id = idAllocator.next(current.authoritative.scene)
        const component = createStudioComponent(type, id, position_mm)
        const nextScene: OpticalScene = {
          ...current.authoritative.scene,
          components: [...current.authoritative.scene.components, component],
        }
        commitScene(
          current,
          nextScene,
          true,
          'Add component',
          editorWithSelection(current.editor, {
            selectedComponentIds: Object.freeze([id]),
            primaryComponentId: id,
          }),
        )
        return id
      },
      deleteComponent: (componentId) => {
        const current = get()
        if (!current.authoritative.scene.components.some(({ id }) => id === componentId)) return false
        if (current.editor.lockedComponentIds.includes(componentId)) return false
        const nextScene: OpticalScene = {
          ...current.authoritative.scene,
          components: current.authoritative.scene.components.filter(({ id }) => id !== componentId),
        }
        const selection = reconcileSelection(
          nextScene,
          current.editor.selectedComponentIds,
          current.editor.primaryComponentId,
        )
        commitScene(
          current,
          nextScene,
          true,
          'Delete component',
          editorWithSelection(current.editor, selection),
        )
        return true
      },
      deleteSelectedComponents: () => {
        const current = get()
        if (current.editor.selectedComponentIds.length === 0) return false
        const locked = new Set(current.editor.lockedComponentIds)
        const selected = new Set(
          current.editor.selectedComponentIds.filter((id) => !locked.has(id)),
        )
        if (selected.size === 0) return false
        const nextScene: OpticalScene = {
          ...current.authoritative.scene,
          components: current.authoritative.scene.components.filter(({ id }) => !selected.has(id)),
        }
        const selection = reconcileSelection(
          nextScene,
          current.editor.selectedComponentIds,
          current.editor.primaryComponentId,
        )
        commitScene(
          current,
          nextScene,
          true,
          selected.size === 1 ? 'Delete component' : 'Delete components',
          editorWithSelection(current.editor, selection),
        )
        return true
      },
      copySelection: () => {
        const current = get()
        if (current.editor.selectedComponentIds.length === 0) return false
        const selected = new Set(current.editor.selectedComponentIds)
        const components = Object.freeze(
          current.authoritative.scene.components
            .filter(({ id }) => selected.has(id))
            .map(componentWithoutId),
        )
        set({
          editor: Object.freeze({
            ...current.editor,
            clipboard: Object.freeze({ components }),
          }),
        })
        return true
      },
      pasteClipboard: () => {
        const clipboard = get().editor.clipboard
        return clipboard
          ? copyComponentsIntoScene(clipboard.components, 'Paste components')
          : Object.freeze([])
      },
      duplicateSelection: () => {
        const current = get()
        const selected = new Set(current.editor.selectedComponentIds)
        const components = current.authoritative.scene.components
          .filter(({ id }) => selected.has(id))
          .map(componentWithoutId)
        return copyComponentsIntoScene(components, 'Duplicate components')
      },
      beginHistoryTransaction: (label) => {
        const current = get()
        if (current.history.activeTransaction) {
          throw new Error('A Studio history transaction is already active.')
        }
        set({
          history: Object.freeze({
            ...current.history,
            activeTransaction: Object.freeze({ label, beforeScene: current.authoritative.scene }),
          }),
        })
      },
      commitHistoryTransaction: () => {
        const current = get()
        const transaction = current.history.activeTransaction
        if (!transaction) return false
        const changed = !scenesHaveEqualDesign(
          transaction.beforeScene,
          current.authoritative.scene,
        )
        set({
          history: changed
            ? Object.freeze({
                past: appendBounded(current.history.past, {
                  label: transaction.label,
                  beforeScene: transaction.beforeScene,
                  afterScene: current.authoritative.scene,
                }),
                future: Object.freeze([]),
                activeTransaction: null,
              })
            : Object.freeze({ ...current.history, activeTransaction: null }),
        })
        return changed
      },
      cancelHistoryTransaction: () => {
        const current = get()
        const transaction = current.history.activeTransaction
        if (!transaction) return false
        if (transaction.beforeScene === current.authoritative.scene) {
          set({ history: Object.freeze({ ...current.history, activeTransaction: null }) })
        } else {
          restoreScene(
            current,
            transaction.beforeScene,
            Object.freeze({ ...current.history, activeTransaction: null }),
          )
        }
        return true
      },
      undo: () => {
        const current = get()
        if (current.history.activeTransaction) return false
        const entry = current.history.past.at(-1)
        if (!entry) return false
        restoreScene(
          current,
          entry.beforeScene,
          Object.freeze({
            past: Object.freeze(current.history.past.slice(0, -1)),
            future: Object.freeze([...current.history.future, entry]),
            activeTransaction: null,
          }),
        )
        return true
      },
      redo: () => {
        const current = get()
        if (current.history.activeTransaction) return false
        const entry = current.history.future.at(-1)
        if (!entry) return false
        restoreScene(
          current,
          entry.afterScene,
          Object.freeze({
            past: appendBounded(current.history.past, entry),
            future: Object.freeze(current.history.future.slice(0, -1)),
            activeTransaction: null,
          }),
        )
        return true
      },
      updateComponentCommon: (componentId, patch) => {
        const current = get()
        const component = current.authoritative.scene.components.find(({ id }) => id === componentId)
        if (!component) throw new RangeError(`Unknown component ID: ${componentId}`)
        const name = patch.name ?? component.name
        const enabled = patch.enabled ?? component.enabled
        if (name === component.name && enabled === component.enabled) return
        const validated = OpticalComponentSchema.parse({ ...component, name, enabled })
        replaceOneComponent(
          componentId,
          { ...component, name: validated.name, enabled: validated.enabled },
          enabled !== component.enabled,
          enabled !== component.enabled ? 'Toggle component' : 'Edit component',
        )
      },
      updateComponentTransform: (componentId, transform) => {
        get().updateComponentTransforms([{ componentId, transform }])
      },
      updateComponentTransforms: (updates) => {
        const current = get()
        commitTransformCommand(
          current,
          updates,
          updates.length === 1 ? 'Move component' : 'Move components',
        )
      },
      updateComponentGeometry: (componentId, aperture_mm) => {
        const current = get()
        const component = current.authoritative.scene.components.find(({ id }) => id === componentId)
        if (!component) throw new RangeError(`Unknown component ID: ${componentId}`)
        if (component.geometry.aperture_mm === aperture_mm) return
        const validated = OpticalComponentSchema.parse({
          ...component,
          geometry: { ...component.geometry, aperture_mm },
        })
        replaceOneComponent(
          componentId,
          { ...component, geometry: validated.geometry },
          true,
          'Edit aperture',
        )
      },
      updateComponentParameters: (componentId, parameters) => {
        const current = get()
        const component = current.authoritative.scene.components.find(({ id }) => id === componentId)
        if (!component) throw new RangeError(`Unknown component ID: ${componentId}`)
        if (
          primitiveRecordsEqual(
            component.parameters as Readonly<Record<string, unknown>>,
            parameters,
          )
        ) return
        replaceOneComponent(
          componentId,
          OpticalComponentSchema.parse({ ...component, parameters }),
          true,
          'Edit optical parameters',
        )
      },
      setGridVisible: (gridVisible) =>
        set((state) => ({ view: Object.freeze({ ...state.view, gridVisible }) })),
      setViewportSize: (width_px, height_px) => {
        const viewport = createViewportSize(width_px, height_px)
        set((state) => ({
          view: Object.freeze({
            ...state.view,
            viewport,
            viewportMeasured: true,
            camera: state.view.viewportMeasured
              ? state.view.camera
              : fitWorldBounds(getSceneWorldBounds(state.authoritative.scene), viewport),
          }),
        }))
      },
      panView: (delta_px) =>
        set((state) => ({
          view: Object.freeze({ ...state.view, camera: panCamera(state.view.camera, delta_px) }),
        })),
      zoomViewAt: (anchor_px, factor) =>
        set((state) => ({
          view: Object.freeze({
            ...state.view,
            camera: zoomCameraAtScreenPoint(state.view.camera, state.view.viewport, anchor_px, factor),
          }),
        })),
      resetView: () =>
        set((state) => ({
          view: Object.freeze({
            ...state.view,
            camera: fitWorldBounds(getSceneWorldBounds(state.authoritative.scene), state.view.viewport),
          }),
        })),
    }
  })
}

export const studioStore = createStudioStore()

export const useStudioStore = <Selection,>(
  selector: (state: StudioState) => Selection,
): Selection => useStore(studioStore, selector)
