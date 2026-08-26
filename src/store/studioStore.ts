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
import { getSceneWorldBounds } from '../features/studio/sceneBounds'
import {
  COMPONENT_EDITABILITY_POLICY,
  normalizeEditorAngleDeg,
} from '../features/studio/editorMath'
import {
  createComponentIdAllocator,
  createStudioComponent,
} from '../project/components/componentDefinitions'
import {
  DEFAULT_RAMAN_SCENE,
  DEFAULT_SIMULATION_CONFIGURATION,
} from '../project/defaults/defaultRamanScene'

export interface StudioAuthoritativeState {
  readonly scene: OpticalScene
  readonly simulationConfiguration: SimulationConfiguration
  readonly revision: number
}

export interface StudioEditorState {
  readonly selectedComponentId: ComponentId | null
  readonly snapEnabled: boolean
}

export interface StudioViewState {
  readonly camera: Camera2D
  readonly viewport: ViewportSize
  readonly viewportMeasured: boolean
  readonly gridVisible: boolean
}

export interface StudioDerivedState {
  readonly trace: TraceResult
  /** Revision of authoritative scene for which this trace remains valid. */
  readonly sceneRevision: number
}

export interface StudioState {
  readonly authoritative: StudioAuthoritativeState
  readonly editor: StudioEditorState
  readonly view: StudioViewState
  readonly derived: StudioDerivedState
  readonly replaceScene: (scene: OpticalScene) => void
  readonly setSelection: (componentId: ComponentId | null) => void
  readonly setSnapEnabled: (enabled: boolean) => void
  readonly addComponent: (
    type: OpticalComponentType,
    position_mm: Vec2,
  ) => ComponentId
  readonly deleteComponent: (componentId: ComponentId) => boolean
  readonly deleteSelectedComponent: () => boolean
  readonly updateComponentCommon: (
    componentId: ComponentId,
    patch: { readonly name?: string; readonly enabled?: boolean },
  ) => void
  readonly updateComponentTransform: (
    componentId: ComponentId,
    transform: Transform2D,
  ) => void
  readonly updateComponentGeometry: (
    componentId: ComponentId,
    aperture_mm: number,
  ) => void
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

const primitiveRecordsEqual = (
  left: Readonly<Record<string, unknown>>,
  right: Readonly<Record<string, unknown>>,
): boolean => {
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key) => left[key] === right[key])
  )
}

export const createStudioStore = (
  initialScene: OpticalScene = DEFAULT_RAMAN_SCENE,
  simulationConfiguration: SimulationConfiguration =
    DEFAULT_SIMULATION_CONFIGURATION,
): StudioStore => {
  const scene = OpticalSceneSchema.parse(initialScene)
  const validatedConfiguration =
    SimulationConfigurationSchema.parse(simulationConfiguration)
  const idAllocator = createComponentIdAllocator(scene)
  const initialCamera = fitWorldBounds(
    getSceneWorldBounds(scene),
    INITIAL_VIEWPORT,
  )

  return createStore<StudioState>()((set, get) => {
    const commitScene = (
      current: StudioState,
      nextScene: OpticalScene,
      retrace: boolean,
      editor: StudioEditorState = current.editor,
    ) => {
      const revision = current.authoritative.revision + 1
      const trace = retrace
        ? traceOpticalScene(
            nextScene,
            current.authoritative.simulationConfiguration,
          )
        : current.derived.trace
      set({
        authoritative: Object.freeze({
          ...current.authoritative,
          scene: nextScene,
          revision,
        }),
        derived: Object.freeze({ trace, sceneRevision: revision }),
        editor,
      })
    }

    const replaceOneComponent = (
      componentId: ComponentId,
      replacement: OpticalComponent,
      retrace: boolean,
    ) => {
      const current = get()
      const componentIndex = current.authoritative.scene.components.findIndex(
        ({ id }) => id === componentId,
      )
      if (componentIndex < 0) {
        throw new RangeError(`Unknown component ID: ${componentId}`)
      }
      const components = current.authoritative.scene.components.map(
        (candidate, index) =>
          index === componentIndex ? replacement : candidate,
      )
      commitScene(
        current,
        { ...current.authoritative.scene, components },
        retrace,
      )
    }

    return {
      authoritative: Object.freeze({
        scene,
        simulationConfiguration: validatedConfiguration,
        revision: 0,
      }),
      editor: Object.freeze({ selectedComponentId: null, snapEnabled: true }),
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
      replaceScene: (nextScene) => {
        const validatedScene = OpticalSceneSchema.parse(nextScene)
        const current = get()
        idAllocator.observe(validatedScene)
        const selectedComponentId = current.editor.selectedComponentId
        commitScene(
          current,
          validatedScene,
          true,
          selectedComponentId &&
            !validatedScene.components.some(({ id }) => id === selectedComponentId)
            ? Object.freeze({ ...current.editor, selectedComponentId: null })
            : current.editor,
        )
      },
      setSelection: (selectedComponentId) => {
        if (
          selectedComponentId !== null &&
          !get().authoritative.scene.components.some(
            ({ id }) => id === selectedComponentId,
          )
        ) {
          throw new RangeError(`Unknown component ID: ${selectedComponentId}`)
        }
        set((state) => ({
          editor: Object.freeze({ ...state.editor, selectedComponentId }),
        }))
      },
      setSnapEnabled: (snapEnabled) =>
        set((state) => ({
          editor: Object.freeze({ ...state.editor, snapEnabled }),
        })),
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
          Object.freeze({ ...current.editor, selectedComponentId: id }),
        )
        return id
      },
      deleteComponent: (componentId) => {
        const current = get()
        if (
          !current.authoritative.scene.components.some(
            ({ id }) => id === componentId,
          )
        ) {
          return false
        }
        const components = current.authoritative.scene.components.filter(
          ({ id }) => id !== componentId,
        )
        const editor =
          current.editor.selectedComponentId === componentId
            ? Object.freeze({ ...current.editor, selectedComponentId: null })
            : current.editor
        commitScene(
          current,
          { ...current.authoritative.scene, components },
          true,
          editor,
        )
        return true
      },
      deleteSelectedComponent: () => {
        const selectedComponentId = get().editor.selectedComponentId
        return selectedComponentId
          ? get().deleteComponent(selectedComponentId)
          : false
      },
      updateComponentCommon: (componentId, patch) => {
        const current = get()
        const component = current.authoritative.scene.components.find(
          ({ id }) => id === componentId,
        )
        if (!component) {
          throw new RangeError(`Unknown component ID: ${componentId}`)
        }
        const name = patch.name ?? component.name
        const enabled = patch.enabled ?? component.enabled
        if (name === component.name && enabled === component.enabled) return
        const validated = OpticalComponentSchema.parse({
          ...component,
          name,
          enabled,
        })
        replaceOneComponent(
          componentId,
          { ...component, name: validated.name, enabled: validated.enabled },
          enabled !== component.enabled,
        )
      },
      updateComponentTransform: (componentId, nextTransform) => {
        const current = get()
        const component = current.authoritative.scene.components.find(
          ({ id }) => id === componentId,
        )
        if (!component) {
          throw new RangeError(`Unknown component ID: ${componentId}`)
        }
        if (!COMPONENT_EDITABILITY_POLICY[component.type].movable) {
          throw new RangeError(
            `Component is not transform-editable: ${componentId}`,
          )
        }
        const transform = Transform2DSchema.parse({
          ...nextTransform,
          rotation_deg: normalizeEditorAngleDeg(nextTransform.rotation_deg),
        })
        if (
          component.transform.x_mm === transform.x_mm &&
          component.transform.y_mm === transform.y_mm &&
          component.transform.rotation_deg === transform.rotation_deg
        ) {
          return
        }
        replaceOneComponent(componentId, { ...component, transform }, true)
      },
      updateComponentGeometry: (componentId, aperture_mm) => {
        const current = get()
        const component = current.authoritative.scene.components.find(
          ({ id }) => id === componentId,
        )
        if (!component) {
          throw new RangeError(`Unknown component ID: ${componentId}`)
        }
        if (component.geometry.aperture_mm === aperture_mm) return
        const validated = OpticalComponentSchema.parse({
          ...component,
          geometry: { ...component.geometry, aperture_mm },
        })
        replaceOneComponent(
          componentId,
          { ...component, geometry: validated.geometry },
          true,
        )
      },
      updateComponentParameters: (componentId, parameters) => {
        const current = get()
        const component = current.authoritative.scene.components.find(
          ({ id }) => id === componentId,
        )
        if (!component) {
          throw new RangeError(`Unknown component ID: ${componentId}`)
        }
        if (
          primitiveRecordsEqual(
            component.parameters as Readonly<Record<string, unknown>>,
            parameters,
          )
        ) {
          return
        }
        replaceOneComponent(
          componentId,
          OpticalComponentSchema.parse({ ...component, parameters }),
          true,
        )
      },
      setGridVisible: (gridVisible) =>
        set((state) => ({
          view: Object.freeze({ ...state.view, gridVisible }),
        })),
      setViewportSize: (width_px, height_px) => {
        const viewport = createViewportSize(width_px, height_px)
        set((state) => ({
          view: Object.freeze({
            ...state.view,
            viewport,
            viewportMeasured: true,
            camera: state.view.viewportMeasured
              ? state.view.camera
              : fitWorldBounds(
                  getSceneWorldBounds(state.authoritative.scene),
                  viewport,
                ),
          }),
        }))
      },
      panView: (delta_px) =>
        set((state) => ({
          view: Object.freeze({
            ...state.view,
            camera: panCamera(state.view.camera, delta_px),
          }),
        })),
      zoomViewAt: (anchor_px, factor) =>
        set((state) => ({
          view: Object.freeze({
            ...state.view,
            camera: zoomCameraAtScreenPoint(
              state.view.camera,
              state.view.viewport,
              anchor_px,
              factor,
            ),
          }),
        })),
      resetView: () =>
        set((state) => ({
          view: Object.freeze({
            ...state.view,
            camera: fitWorldBounds(
              getSceneWorldBounds(state.authoritative.scene),
              state.view.viewport,
            ),
          }),
        })),
    }
  })
}

export const studioStore = createStudioStore()

export const useStudioStore = <Selection,>(
  selector: (state: StudioState) => Selection,
): Selection => useStore(studioStore, selector)
