import type { Breadboard, OpticalScene, TraceResult } from '../../core/optics'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { worldToScreen, type Camera2D, type ViewportSize } from './camera'
import { ComponentMarker } from './ComponentMarker'

interface LayerViewProps {
  readonly camera: Camera2D
  readonly viewport: ViewportSize
}

interface WorkspaceGridProps extends LayerViewProps {
  readonly pitch_mm: number
  readonly visible: boolean
}

export function WorkspaceGrid({
  camera,
  viewport,
  pitch_mm,
  visible,
}: WorkspaceGridProps) {
  if (!visible) return null
  const origin = worldToScreen({ x: 0, y: 0 }, camera, viewport)
  const pitch_px = pitch_mm * camera.zoom_px_per_mm
  const x = ((origin.x_px % pitch_px) + pitch_px) % pitch_px
  const y = ((origin.y_px % pitch_px) + pitch_px) % pitch_px

  return (
    <>
      <defs>
        <pattern
          id="workspace-grid"
          x={x}
          y={y}
          width={pitch_px}
          height={pitch_px}
          patternUnits="userSpaceOnUse"
        >
          <circle cx={0} cy={0} r={1.15} className="workspace-grid-dot" />
        </pattern>
      </defs>
      <rect
        className="workspace-grid"
        width={viewport.width_px}
        height={viewport.height_px}
        fill="url(#workspace-grid)"
      />
    </>
  )
}

const breadboardHoles = (breadboard: Breadboard) => {
  const holes: { x: number; y: number; key: string }[] = []
  for (
    let x = 0;
    x <= breadboard.width_mm + 1e-9;
    x += breadboard.hole_pitch_mm
  ) {
    for (
      let y = 0;
      y <= breadboard.height_mm + 1e-9;
      y += breadboard.hole_pitch_mm
    ) {
      holes.push({
        x: breadboard.origin_mm.x + x,
        y: breadboard.origin_mm.y - y,
        key: `${x}:${y}`,
      })
    }
  }
  return holes
}

interface BreadboardLayerProps extends LayerViewProps {
  readonly breadboards: OpticalScene['breadboards']
  readonly gridVisible: boolean
}

export function BreadboardLayer({
  breadboards,
  camera,
  viewport,
  gridVisible,
}: BreadboardLayerProps) {
  return breadboards.map((breadboard) => {
    const topLeft = worldToScreen(breadboard.origin_mm, camera, viewport)
    const bottomRight = worldToScreen(
      {
        x: breadboard.origin_mm.x + breadboard.width_mm,
        y: breadboard.origin_mm.y - breadboard.height_mm,
      },
      camera,
      viewport,
    )

    return (
      <g key={breadboard.id} data-breadboard-id={breadboard.id}>
        <rect
          className="breadboard-plate"
          x={topLeft.x_px}
          y={topLeft.y_px}
          width={bottomRight.x_px - topLeft.x_px}
          height={bottomRight.y_px - topLeft.y_px}
          rx={10}
        />
        {gridVisible &&
          breadboardHoles(breadboard).map((hole) => {
            const point = worldToScreen(hole, camera, viewport)
            return (
              <circle
                key={hole.key}
                className="breadboard-hole"
                cx={point.x_px}
                cy={point.y_px}
                r={Math.min(2.8, Math.max(1.1, camera.zoom_px_per_mm * 0.9))}
              />
            )
          })}
        <text
          className="breadboard-label"
          x={topLeft.x_px + 14}
          y={topLeft.y_px + 24}
        >
          {breadboard.name.toUpperCase()} · {breadboard.hole_pitch_mm} MM PITCH
        </text>
      </g>
    )
  })
}

interface TraceLayerProps extends LayerViewProps {
  readonly trace: TraceResult
}

export function TraceLayer({ trace, camera, viewport }: TraceLayerProps) {
  const rayKinds = new Map(trace.rays.map((ray) => [ray.rayId, ray.kind]))

  return (
    <g className="trace-layer" aria-label="Computed optical trace">
      {trace.segments.map((segment) => {
        const start = worldToScreen(segment.start, camera, viewport)
        const end = worldToScreen(segment.end, camera, viewport)
        const kind = rayKinds.get(segment.rayId) ?? 'excitation'
        return (
          <line
            key={segment.rayId}
            className={`trace-segment trace-${kind}`}
            data-ray-id={segment.rayId}
            x1={start.x_px}
            y1={start.y_px}
            x2={end.x_px}
            y2={end.y_px}
          />
        )
      })}
    </g>
  )
}

interface ComponentLayerProps extends LayerViewProps {
  readonly components: OpticalScene['components']
  readonly selectedComponentId?: string | null
  readonly onMovePointerDown?: (
    component: OpticalScene['components'][number],
    event: ReactPointerEvent<SVGCircleElement>,
  ) => void
  readonly onRotatePointerDown?: (
    component: OpticalScene['components'][number],
    event: ReactPointerEvent<SVGCircleElement>,
  ) => void
}

export function ComponentLayer({
  components,
  camera,
  viewport,
  selectedComponentId = null,
  onMovePointerDown,
  onRotatePointerDown,
}: ComponentLayerProps) {
  return (
    <g className="component-layer" aria-label="Optical components">
      {components.map((component) => (
        <ComponentMarker
          key={component.id}
          component={component}
          camera={camera}
          viewport={viewport}
          selected={component.id === selectedComponentId}
          onMovePointerDown={onMovePointerDown}
          onRotatePointerDown={onRotatePointerDown}
        />
      ))}
    </g>
  )
}
