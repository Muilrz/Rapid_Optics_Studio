import {
  useEffect,
  useLayoutEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react'
import type { ComponentId, OpticalComponent, Transform2D, Vec2 } from '../../core/optics'
import { useStudioStore } from '../../store/studioStore'
import { BreadboardLayer, ComponentLayer, TraceLayer, WorkspaceGrid } from './benchLayers'
import { screenToWorld, type ScreenPoint } from './camera'
import {
  COMPONENT_EDITABILITY_POLICY,
  moveTransformGroupFromWorldPointers,
  rotateTransformTowardWorldPointer,
} from './editorMath'

interface GestureBase {
  readonly pointerId: number
  readonly captureTarget: SVGElement
}

interface PanGesture extends GestureBase {
  readonly kind: 'pan'
  readonly previousClient: { readonly x: number; readonly y: number }
}

interface MoveGesture extends GestureBase {
  readonly kind: 'move'
  readonly clickedComponentId: ComponentId
  readonly primaryComponentId: ComponentId
  readonly startingTransforms: readonly {
    readonly id: ComponentId
    readonly transform: Transform2D
  }[]
  readonly startingPointer_mm: Vec2
  readonly collapseToClickedOnRelease: boolean
  readonly moved: boolean
}

interface RotateGesture extends GestureBase {
  readonly kind: 'rotate'
  readonly componentId: ComponentId
  readonly startingTransform: Transform2D
  readonly moved: boolean
}

type ActiveGesture = PanGesture | MoveGesture | RotateGesture

const clientToScreenPoint = (
  clientX: number,
  clientY: number,
  svg: SVGSVGElement,
  viewport: { readonly width_px: number; readonly height_px: number },
): ScreenPoint => {
  const bounds = svg.getBoundingClientRect()
  return {
    x_px: ((clientX - bounds.left) * viewport.width_px) / bounds.width,
    y_px: ((clientY - bounds.top) * viewport.height_px) / bounds.height,
  }
}

const hasTextEditingTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLInputElement ||
  target instanceof HTMLTextAreaElement ||
  target instanceof HTMLSelectElement ||
  (target instanceof HTMLElement && target.isContentEditable)

export function OpticalBench() {
  const containerRef = useRef<HTMLDivElement>(null)
  const activeGesture = useRef<ActiveGesture | null>(null)
  const scene = useStudioStore((state) => state.authoritative.scene)
  const trace = useStudioStore((state) => state.derived.trace)
  const selectedComponentIds = useStudioStore((state) => state.editor.selectedComponentIds)
  const primaryComponentId = useStudioStore((state) => state.editor.primaryComponentId)
  const snapEnabled = useStudioStore((state) => state.editor.snapEnabled)
  const camera = useStudioStore((state) => state.view.camera)
  const viewport = useStudioStore((state) => state.view.viewport)
  const gridVisible = useStudioStore((state) => state.view.gridVisible)
  const setSelection = useStudioStore((state) => state.setSelection)
  const updateComponentTransform = useStudioStore((state) => state.updateComponentTransform)
  const updateComponentTransforms = useStudioStore((state) => state.updateComponentTransforms)
  const deleteSelectedComponents = useStudioStore((state) => state.deleteSelectedComponents)
  const copySelection = useStudioStore((state) => state.copySelection)
  const pasteClipboard = useStudioStore((state) => state.pasteClipboard)
  const duplicateSelection = useStudioStore((state) => state.duplicateSelection)
  const beginHistoryTransaction = useStudioStore((state) => state.beginHistoryTransaction)
  const commitHistoryTransaction = useStudioStore((state) => state.commitHistoryTransaction)
  const cancelHistoryTransaction = useStudioStore((state) => state.cancelHistoryTransaction)
  const undo = useStudioStore((state) => state.undo)
  const redo = useStudioStore((state) => state.redo)
  const setViewportSize = useStudioStore((state) => state.setViewportSize)
  const panView = useStudioStore((state) => state.panView)
  const zoomViewAt = useStudioStore((state) => state.zoomViewAt)
  const breadboard = scene.breadboards[0]
  const gridPitch_mm = breadboard?.hole_pitch_mm ?? 25
  const gridOrigin_mm = breadboard?.origin_mm ?? { x: 0, y: 0 }

  useLayoutEffect(() => {
    const element = containerRef.current
    if (!element) return
    const updateSize = () => {
      const { width, height } = element.getBoundingClientRect()
      if (width > 0 && height > 0) setViewportSize(width, height)
    }
    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(element)
    return () => observer.disconnect()
  }, [setViewportSize])

  useEffect(() => {
    const releaseGesture = (gesture: ActiveGesture) => {
      if (gesture.captureTarget.hasPointerCapture(gesture.pointerId)) {
        gesture.captureTarget.releasePointerCapture(gesture.pointerId)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (hasTextEditingTarget(event.target)) return
      if (event.key === 'Escape') {
        const gesture = activeGesture.current
        if (gesture?.kind === 'move' || gesture?.kind === 'rotate') {
          cancelHistoryTransaction()
        }
        if (gesture) releaseGesture(gesture)
        activeGesture.current = null
        setSelection(null)
        return
      }
      if (activeGesture.current) return

      const command = event.ctrlKey || event.metaKey
      if (command) {
        const key = event.key.toLowerCase()
        if (key === 'c') {
          if (copySelection()) event.preventDefault()
          return
        }
        if (key === 'v') {
          if (pasteClipboard().length > 0) event.preventDefault()
          return
        }
        if (key === 'd') {
          if (duplicateSelection().length > 0) event.preventDefault()
          return
        }
        if (key === 'z') {
          const changed = event.shiftKey ? redo() : undo()
          if (changed) event.preventDefault()
          return
        }
        if (key === 'y') {
          if (redo()) event.preventDefault()
          return
        }
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (deleteSelectedComponents()) event.preventDefault()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    cancelHistoryTransaction,
    copySelection,
    deleteSelectedComponents,
    duplicateSelection,
    pasteClipboard,
    redo,
    setSelection,
    undo,
  ])

  const pointerWorld = (clientX: number, clientY: number, svg: SVGSVGElement) =>
    screenToWorld(clientToScreenPoint(clientX, clientY, svg, viewport), camera, viewport)

  const startComponentMove = (
    component: OpticalComponent,
    event: ReactPointerEvent<SVGCircleElement>,
  ) => {
    if (event.button !== 0) return
    event.stopPropagation()
    event.preventDefault()
    const toggle = event.ctrlKey || event.metaKey || event.shiftKey
    const wasSelected = selectedComponentIds.includes(component.id)
    if (toggle) {
      setSelection(component.id, 'toggle')
      if (wasSelected) return
    } else if (!wasSelected) {
      setSelection(component.id)
    }
    if (!COMPONENT_EDITABILITY_POLICY[component.type].movable) return

    const svg = event.currentTarget.ownerSVGElement
    if (!svg) return
    const groupIds = toggle
      ? [...selectedComponentIds, component.id]
      : wasSelected
        ? selectedComponentIds
        : [component.id]
    const primary = toggle ? component.id : wasSelected ? primaryComponentId : component.id
    if (!primary) return
    const selected = new Set(groupIds)
    const startingTransforms = scene.components
      .filter(({ id }) => selected.has(id))
      .map(({ id, transform }) => ({ id, transform }))

    beginHistoryTransaction(groupIds.length === 1 ? 'Move component' : 'Move components')
    event.currentTarget.setPointerCapture(event.pointerId)
    activeGesture.current = {
      kind: 'move',
      pointerId: event.pointerId,
      captureTarget: event.currentTarget,
      clickedComponentId: component.id,
      primaryComponentId: primary,
      startingTransforms,
      startingPointer_mm: pointerWorld(event.clientX, event.clientY, svg),
      collapseToClickedOnRelease: !toggle && wasSelected && groupIds.length > 1,
      moved: false,
    }
  }

  const startComponentRotation = (
    component: OpticalComponent,
    event: ReactPointerEvent<SVGCircleElement>,
  ) => {
    if (event.button !== 0 || selectedComponentIds.length !== 1) return
    event.stopPropagation()
    event.preventDefault()
    if (!COMPONENT_EDITABILITY_POLICY[component.type].rotatable) return
    const svg = event.currentTarget.ownerSVGElement
    if (!svg) return
    beginHistoryTransaction('Rotate component')
    event.currentTarget.setPointerCapture(event.pointerId)
    activeGesture.current = {
      kind: 'rotate',
      pointerId: event.pointerId,
      captureTarget: event.currentTarget,
      componentId: component.id,
      startingTransform: component.transform,
      moved: false,
    }
  }

  const handleBackgroundPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return
    setSelection(null)
    event.currentTarget.setPointerCapture(event.pointerId)
    activeGesture.current = {
      kind: 'pan',
      pointerId: event.pointerId,
      captureTarget: event.currentTarget,
      previousClient: { x: event.clientX, y: event.clientY },
    }
  }

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const gesture = activeGesture.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    if (gesture.kind === 'pan') {
      panView({
        x_px: event.clientX - gesture.previousClient.x,
        y_px: event.clientY - gesture.previousClient.y,
      })
      activeGesture.current = {
        ...gesture,
        previousClient: { x: event.clientX, y: event.clientY },
      }
      return
    }

    const pointer_mm = pointerWorld(event.clientX, event.clientY, event.currentTarget)
    if (gesture.kind === 'move') {
      const moved = moveTransformGroupFromWorldPointers(
        gesture.startingTransforms,
        gesture.primaryComponentId,
        gesture.startingPointer_mm,
        pointer_mm,
        snapEnabled ? { pitch_mm: gridPitch_mm, origin_mm: gridOrigin_mm } : undefined,
      )
      updateComponentTransforms(
        moved.map(({ id, transform }) => ({ componentId: id as ComponentId, transform })),
      )
      const didMove = moved.some(({ id, transform }) => {
        const starting = gesture.startingTransforms.find((candidate) => candidate.id === id)?.transform
        return (
          starting !== undefined &&
          (starting.x_mm !== transform.x_mm || starting.y_mm !== transform.y_mm)
        )
      })
      activeGesture.current = { ...gesture, moved: gesture.moved || didMove }
      return
    }

    try {
      const transform = rotateTransformTowardWorldPointer(gesture.startingTransform, pointer_mm)
      updateComponentTransform(gesture.componentId, transform)
      activeGesture.current = {
        ...gesture,
        moved:
          gesture.moved ||
          transform.rotation_deg !== gesture.startingTransform.rotation_deg,
      }
    } catch (error) {
      if (!(error instanceof RangeError)) throw error
    }
  }

  const finishGesture = (event: ReactPointerEvent<SVGSVGElement>, cancelled: boolean) => {
    const gesture = activeGesture.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    if (gesture.kind === 'move' || gesture.kind === 'rotate') {
      if (cancelled) cancelHistoryTransaction()
      else commitHistoryTransaction()
    }
    if (
      !cancelled &&
      gesture.kind === 'move' &&
      !gesture.moved &&
      gesture.collapseToClickedOnRelease
    ) {
      setSelection(gesture.clickedComponentId)
    }
    if (gesture.captureTarget.hasPointerCapture(event.pointerId)) {
      gesture.captureTarget.releasePointerCapture(event.pointerId)
    }
    activeGesture.current = null
  }

  const handleWheel = (event: ReactWheelEvent<SVGSVGElement>) => {
    event.preventDefault()
    if (activeGesture.current) return
    const point = clientToScreenPoint(event.clientX, event.clientY, event.currentTarget, viewport)
    zoomViewAt(point, Math.exp(-event.deltaY * 0.0015))
  }

  return (
    <div className="bench-viewport" ref={containerRef}>
      <svg
        className="optical-bench"
        viewBox={`0 0 ${viewport.width_px} ${viewport.height_px}`}
        role="application"
        aria-label="Editable two-dimensional optical bench"
        onPointerDown={handleBackgroundPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(event) => finishGesture(event, false)}
        onPointerCancel={(event) => finishGesture(event, true)}
        onWheel={handleWheel}
      >
        <title>Rapid Optics Studio editable optical bench</title>
        <rect className="workspace-background" width={viewport.width_px} height={viewport.height_px} />
        <WorkspaceGrid camera={camera} viewport={viewport} pitch_mm={gridPitch_mm} visible={gridVisible} />
        <BreadboardLayer
          breadboards={scene.breadboards}
          camera={camera}
          viewport={viewport}
          gridVisible={gridVisible}
        />
        <TraceLayer trace={trace} camera={camera} viewport={viewport} />
        <ComponentLayer
          components={scene.components}
          camera={camera}
          viewport={viewport}
          selectedComponentIds={selectedComponentIds}
          primaryComponentId={primaryComponentId}
          onMovePointerDown={startComponentMove}
          onRotatePointerDown={startComponentRotation}
        />
      </svg>
      <div className="bench-hint" aria-hidden="true">
        Shift/Ctrl click to multi-select · Drag selection to move · Cmd/Ctrl C, V, D · Undo Cmd/Ctrl Z
      </div>
      <div className="camera-readout">{camera.zoom_px_per_mm.toFixed(2)} px/mm</div>
    </div>
  )
}
