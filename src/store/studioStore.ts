import { useStore } from 'zustand'
import { createStore, type StoreApi } from 'zustand/vanilla'
import {
  OpticalSceneSchema,
  SimulationConfigurationSchema,
  Transform2DSchema,
  traceOpticalScene,
  type ComponentId,
  type OpticalScene,
  type SimulationConfiguration,
  type TraceResult,
  type Transform2D,
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
  /** Revision of authoritative scene used to compute `trace`. */
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
  readonly updateComponentTransform: (
    componentId: ComponentId,
    transform: Transform2D,
  ) => void
  readonly setGridVisible: (visible: boolean) => void
  readonly setViewportSize: (width_px: number, height_px: number) => void
  readonly panView: (delta_px: ScreenPoint) => void
  readonly zoomViewAt: (anchor_px: ScreenPoint, factor: number) => void
  readonly resetView: () => void
}

export type StudioStore = StoreApi<StudioState>

const INITIAL_VIEWPORT = createViewportSize(1200, 720)

export const createStudioStore = (
  initialScene: OpticalScene = DEFAULT_RAMAN_SCENE,
  simulationConfiguration: SimulationConfiguration =
    DEFAULT_SIMULATION_CONFIGURATION,
): StudioStore => {
  const scene = OpticalSceneSchema.parse(initialScene)
  const validatedConfiguration =
    SimulationConfigurationSchema.parse(simulationConfiguration)
  const initialCamera = fitWorldBounds(
    getSceneWorldBounds(scene),
    INITIAL_VIEWPORT,
  )

  return createStore<StudioState>()((set, get) => ({
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
      const revision = current.authoritative.revision + 1
      const trace = traceOpticalScene(
        validatedScene,
        current.authoritative.simulationConfiguration,
      )
      set({
        authoritative: Object.freeze({
          ...current.authoritative,
          scene: validatedScene,
          revision,
        }),
        derived: Object.freeze({ trace, sceneRevision: revision }),
        editor: current.editor.selectedComponentId
          ? Object.freeze({
              ...current.editor,
              selectedComponentId: validatedScene.components.some(
                ({ id }) => id === current.editor.selectedComponentId,
              )
                ? current.editor.selectedComponentId
                : null,
            })
          : current.editor,
      })
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
    updateComponentTransform: (componentId, nextTransform) => {
      const current = get()
      const componentIndex = current.authoritative.scene.components.findIndex(
        ({ id }) => id === componentId,
      )
      if (componentIndex < 0) {
        throw new RangeError(`Unknown component ID: ${componentId}`)
      }
      const component = current.authoritative.scene.components[componentIndex]
      if (!COMPONENT_EDITABILITY_POLICY[component.type].movable) {
        throw new RangeError(`Component is not transform-editable: ${componentId}`)
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

      const components = current.authoritative.scene.components.map(
        (candidate, index) =>
          index === componentIndex ? { ...candidate, transform } : candidate,
      )
      const scene: OpticalScene = {
        ...current.authoritative.scene,
        components,
      }
      const revision = current.authoritative.revision + 1
      const trace = traceOpticalScene(
        scene,
        current.authoritative.simulationConfiguration,
      )
      set({
        authoritative: Object.freeze({
          ...current.authoritative,
          scene,
          revision,
        }),
        derived: Object.freeze({ trace, sceneRevision: revision }),
      })
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
  }))
}

export const studioStore = createStudioStore()

export const useStudioStore = <Selection,>(
  selector: (state: StudioState) => Selection,
): Selection => useStore(studioStore, selector)
