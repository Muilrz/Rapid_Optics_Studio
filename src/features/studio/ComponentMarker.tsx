import type { PointerEvent as ReactPointerEvent } from 'react'
import type { OpticalComponent } from '../../core/optics'
import { worldToScreen, type Camera2D, type ViewportSize } from './camera'
import { COMPONENT_RENDER_REGISTRY } from './componentRenderRegistry'
import { COMPONENT_EDITABILITY_POLICY } from './editorMath'

interface ComponentMarkerProps {
  readonly component: OpticalComponent
  readonly camera: Camera2D
  readonly viewport: ViewportSize
  readonly selected?: boolean
  readonly onMovePointerDown?: (
    component: OpticalComponent,
    event: ReactPointerEvent<SVGCircleElement>,
  ) => void
  readonly onRotatePointerDown?: (
    component: OpticalComponent,
    event: ReactPointerEvent<SVGCircleElement>,
  ) => void
}

export function ComponentMarker({
  component,
  camera,
  viewport,
  selected = false,
  onMovePointerDown,
  onRotatePointerDown,
}: ComponentMarkerProps) {
  const renderer = COMPONENT_RENDER_REGISTRY[component.type]
  const editability = COMPONENT_EDITABILITY_POLICY[component.type]
  const point = worldToScreen(
    { x: component.transform.x_mm, y: component.transform.y_mm },
    camera,
    viewport,
  )
  const size_px = Math.min(
    58,
    Math.max(
      20,
      component.visualization.visual_depth_mm * camera.zoom_px_per_mm,
    ),
  )
  const aperture_px = Math.min(
    72,
    Math.max(16, component.geometry.aperture_mm * camera.zoom_px_per_mm),
  )
  const selectionRadius_px = Math.max(20, Math.min(44, aperture_px / 2 + 9))
  const rotationHandleOffset_px = Math.max(40, selectionRadius_px + 18)
  const Glyph = renderer.Glyph

  return (
    <g
      className={`component-marker component-marker--${component.type}${component.enabled ? '' : ' component-marker--disabled'}${selected ? ' component-marker--selected' : ''}`}
      transform={`translate(${point.x_px} ${point.y_px})`}
      data-component-id={component.id}
      data-component-type={component.type}
      data-world-x-mm={component.transform.x_mm}
      data-world-y-mm={component.transform.y_mm}
      data-world-rotation-deg={component.transform.rotation_deg}
      data-selected={selected}
      aria-label={`${renderer.label}: ${component.name}`}
      style={{ color: renderer.accent }}
    >
      {selected && (
        <circle
          className="component-selection-ring"
          r={selectionRadius_px}
        />
      )}
      <g
        className="component-glyph"
        transform={`rotate(${-component.transform.rotation_deg})`}
      >
        <Glyph size_px={size_px} aperture_px={aperture_px} />
      </g>
      <text className="component-label" y={size_px / 2 + 15}>
        {renderer.shortLabel}
      </text>
      {editability.selectable && (
        <circle
          className="component-hit-target"
          data-component-hit-target={component.id}
          r={Math.max(24, selectionRadius_px)}
          onPointerDown={(event) => onMovePointerDown?.(component, event)}
        />
      )}
      {selected && editability.rotatable && (
        <g
          className="rotation-control"
          transform={`rotate(${-component.transform.rotation_deg})`}
        >
          <line
            className="rotation-guide"
            x1={selectionRadius_px}
            y1={0}
            x2={rotationHandleOffset_px}
            y2={0}
          />
          <circle
            className="rotation-handle"
            data-rotation-handle={component.id}
            cx={rotationHandleOffset_px}
            cy={0}
            r={7}
            onPointerDown={(event) =>
              onRotatePointerDown?.(component, event)
            }
          />
        </g>
      )}
    </g>
  )
}
