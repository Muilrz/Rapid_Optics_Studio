import {
  useEffect,
  useLayoutEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react'
import type {
  ComponentId,
  OpticalComponent,
  Transform2D,
  Vec2,
} from '../../core/optics'
import { useStudioStore } from '../../store/studioStore'
import {
  BreadboardLayer,
  ComponentLayer,
  TraceLayer,
  WorkspaceGrid,
} from './benchLayers'
import { screenToWorld, type ScreenPoint } from './camera'
import {
  COMPONENT_EDITABILITY_POLICY,
  moveTransformFromWorldPointers,
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

interface ComponentGestureBase extends GestureBase {
  readonly componentId: ComponentId
  readonly startingTransform: Transform2D
}

interface MoveGesture extends ComponentGestureBase {
  readonly kind: 'move'
  readonly startingPointer_mm: Vec2
}

interface RotateGesture extends ComponentGestureBase {
  readonly kind: 'rotate'
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

export function OpticalBench() {
  const containerRef = useRef<HTMLDivElement>(null)
  const activeGesture = useRef<ActiveGesture | null>(null)
  const scene = useStudioStore((state) => state.authoritative.scene)
  const trace = useStudioStore((state) => state.derived.trace)
  const selectedComponentId = useStudioStore(
    (state) => state.editor.selectedComponentId,
  )
  const snapEnabled = useStudioStore((state) => state.editor.snapEnabled)
  const camera = useStudioStore((state) => state.view.camera)
  const viewport = useStudioStore((state) => state.view.viewport)
  const gridVisible = useStudioStore((state) => state.view.gridVisible)
  const setSelection = useStudioStore((state) => state.setSelection)
  const updateComponentTransform = useStudioStore(
    (state) => state.updateComponentTransform,
  )
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
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      const gesture = activeGesture.current
      if (gesture?.kind === 'move' || gesture?.kind === 'rotate') {
        updateComponentTransform(
          gesture.componentId,
          gesture.startingTransform,
        )
      }
      if (
        gesture &&
        gesture.captureTarget.hasPointerCapture(gesture.pointerId)
      ) {
        gesture.captureTarget.releasePointerCapture(gesture.pointerId)
      }
      activeGesture.current = null
      setSelection(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [setSelection, updateComponentTransform])

  const pointerWorld = (
    clientX: number,
    clientY: number,
    svg: SVGSVGElement,
  ) =>
    screenToWorld(
      clientToScreenPoint(clientX, clientY, svg, viewport),
      camera,
      viewport,
    )

  const startComponentMove = (
    component: OpticalComponent,
    event: ReactPointerEvent<SVGCircleElement>,
  ) => {
    if (event.button !== 0) return
    event.stopPropagation()
    event.preventDefault()
    setSelection(component.id)
    if (!COMPONENT_EDITABILITY_POLICY[component.type].movable) return
    const svg = event.currentTarget.ownerSVGElement
    if (!svg) return
    event.currentTarget.setPointerCapture(event.pointerId)
    activeGesture.current = {
      kind: 'move',
      pointerId: event.pointerId,
      captureTarget: event.currentTarget,
      componentId: component.id,
      startingTransform: component.transform,
      startingPointer_mm: pointerWorld(event.clientX, event.clientY, svg),
    }
  }

  const startComponentRotation = (
    component: OpticalComponent,
    event: ReactPointerEvent<SVGCircleElement>,
  ) => {
    if (event.button !== 0) return
    event.stopPropagation()
    event.preventDefault()
    setSelection(component.id)
    if (!COMPONENT_EDITABILITY_POLICY[component.type].rotatable) return
    const svg = event.currentTarget.ownerSVGElement
    if (!svg) return
    event.currentTarget.setPointerCapture(event.pointerId)
    activeGesture.current = {
      kind: 'rotate',
      pointerId: event.pointerId,
      captureTarget: event.currentTarget,
      componentId: component.id,
      startingTransform: component.transform,
    }
  }

  const handleBackgroundPointerDown = (
    event: ReactPointerEvent<SVGSVGElement>,
  ) => {
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

    const pointer_mm = pointerWorld(
      event.clientX,
      event.clientY,
      event.currentTarget,
    )
    if (gesture.kind === 'move') {
      updateComponentTransform(
        gesture.componentId,
        moveTransformFromWorldPointers(
          gesture.startingTransform,
          gesture.startingPointer_mm,
          pointer_mm,
          snapEnabled
            ? { pitch_mm: gridPitch_mm, origin_mm: gridOrigin_mm }
            : undefined,
        ),
      )
      return
    }

    updateComponentTransform(
      gesture.componentId,
      rotateTransformTowardWorldPointer(gesture.startingTransform, pointer_mm),
    )
  }

  const finishGesture = (
    event: ReactPointerEvent<SVGSVGElement>,
    cancelled: boolean,
  ) => {
    const gesture = activeGesture.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    if (cancelled && (gesture.kind === 'move' || gesture.kind === 'rotate')) {
      updateComponentTransform(gesture.componentId, gesture.startingTransform)
    }
    if (gesture.captureTarget.hasPointerCapture(event.pointerId)) {
      gesture.captureTarget.releasePointerCapture(event.pointerId)
    }
    activeGesture.current = null
  }

  const handleWheel = (event: ReactWheelEvent<SVGSVGElement>) => {
    event.preventDefault()
    if (activeGesture.current) return
    const point = clientToScreenPoint(
      event.clientX,
      event.clientY,
      event.currentTarget,
      viewport,
    )
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
        <rect
          className="workspace-background"
          width={viewport.width_px}
          height={viewport.height_px}
        />
        <WorkspaceGrid
          camera={camera}
          viewport={viewport}
          pitch_mm={gridPitch_mm}
          visible={gridVisible}
        />
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
          selectedComponentId={selectedComponentId}
          onMovePointerDown={startComponentMove}
          onRotatePointerDown={startComponentRotation}
        />
      </svg>
      <div className="bench-hint" aria-hidden="true">
        Drag component to move · Drag round handle to rotate · Drag background to
        pan
      </div>
      <div className="camera-readout">
        {camera.zoom_px_per_mm.toFixed(2)} px/mm
      </div>
    </div>
  )
}
