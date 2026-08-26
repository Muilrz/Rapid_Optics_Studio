import type { OpticalComponent } from '../../core/optics'
import { worldToScreen, type Camera2D, type ViewportSize } from './camera'
import { COMPONENT_RENDER_REGISTRY } from './componentRenderRegistry'

interface ComponentMarkerProps {
  readonly component: OpticalComponent
  readonly camera: Camera2D
  readonly viewport: ViewportSize
}

export function ComponentMarker({
  component,
  camera,
  viewport,
}: ComponentMarkerProps) {
  const renderer = COMPONENT_RENDER_REGISTRY[component.type]
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
  const Glyph = renderer.Glyph

  return (
    <g
      className={`component-marker component-marker--${component.type}${component.enabled ? '' : ' component-marker--disabled'}`}
      transform={`translate(${point.x_px} ${point.y_px})`}
      data-component-id={component.id}
      data-component-type={component.type}
      data-world-x-mm={component.transform.x_mm}
      data-world-y-mm={component.transform.y_mm}
      data-world-rotation-deg={component.transform.rotation_deg}
      aria-label={`${renderer.label}: ${component.name}`}
      style={{ color: renderer.accent }}
    >
      <g
        className="component-glyph"
        transform={`rotate(${-component.transform.rotation_deg})`}
      >
        <Glyph size_px={size_px} aperture_px={aperture_px} />
      </g>
      <text className="component-label" y={size_px / 2 + 15}>
        {renderer.shortLabel}
      </text>
    </g>
  )
}
