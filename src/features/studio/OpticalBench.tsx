import {
  useLayoutEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react'
import { useStudioStore } from '../../store/studioStore'
import {
  BreadboardLayer,
  ComponentLayer,
  TraceLayer,
  WorkspaceGrid,
} from './benchLayers'

interface ActivePan {
  readonly pointerId: number
  readonly x_px: number
  readonly y_px: number
}

export function OpticalBench() {
  const containerRef = useRef<HTMLDivElement>(null)
  const activePan = useRef<ActivePan | null>(null)
  const scene = useStudioStore((state) => state.authoritative.scene)
  const trace = useStudioStore((state) => state.derived.trace)
  const camera = useStudioStore((state) => state.view.camera)
  const viewport = useStudioStore((state) => state.view.viewport)
  const gridVisible = useStudioStore((state) => state.view.gridVisible)
  const setViewportSize = useStudioStore((state) => state.setViewportSize)
  const panView = useStudioStore((state) => state.panView)
  const zoomViewAt = useStudioStore((state) => state.zoomViewAt)
  const gridPitch_mm = scene.breadboards[0]?.hole_pitch_mm ?? 25

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

  const handlePointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    activePan.current = {
      pointerId: event.pointerId,
      x_px: event.clientX,
      y_px: event.clientY,
    }
  }

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const previous = activePan.current
    if (!previous || previous.pointerId !== event.pointerId) return
    panView({
      x_px: event.clientX - previous.x_px,
      y_px: event.clientY - previous.y_px,
    })
    activePan.current = {
      pointerId: event.pointerId,
      x_px: event.clientX,
      y_px: event.clientY,
    }
  }

  const finishPan = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (activePan.current?.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    activePan.current = null
  }

  const handleWheel = (event: ReactWheelEvent<SVGSVGElement>) => {
    event.preventDefault()
    const bounds = event.currentTarget.getBoundingClientRect()
    zoomViewAt(
      { x_px: event.clientX - bounds.left, y_px: event.clientY - bounds.top },
      Math.exp(-event.deltaY * 0.0015),
    )
  }

  return (
    <div className="bench-viewport" ref={containerRef}>
      <svg
        className="optical-bench"
        viewBox={`0 0 ${viewport.width_px} ${viewport.height_px}`}
        role="img"
        aria-label="Read-only two-dimensional optical bench"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPan}
        onPointerCancel={finishPan}
        onWheel={handleWheel}
      >
        <title>Rapid Optics Studio optical bench</title>
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
        />
      </svg>
      <div className="bench-hint" aria-hidden="true">
        Drag to pan · Scroll to zoom
      </div>
      <div className="camera-readout">
        {camera.zoom_px_per_mm.toFixed(2)} px/mm
      </div>
    </div>
  )
}
