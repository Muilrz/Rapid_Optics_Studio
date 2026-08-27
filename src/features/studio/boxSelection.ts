import type { ComponentId, OpticalComponent, OpticalScene } from '../../core/optics'
import { worldToScreen, type Camera2D, type ScreenPoint, type ViewportSize } from './camera'
import type { SelectionMode } from './editorSelection'

/**
 * Component picking is a Studio presentation concern. This fixed screen-space
 * radius intentionally does not use the Optical Core aperture/intersection.
 */
export const COMPONENT_PRESENTATION_HIT_RADIUS_PX = 30

export interface ScreenRect {
  readonly min_x_px: number
  readonly max_x_px: number
  readonly min_y_px: number
  readonly max_y_px: number
}

export const createScreenRect = (start: ScreenPoint, end: ScreenPoint): ScreenRect =>
  Object.freeze({
    min_x_px: Math.min(start.x_px, end.x_px),
    max_x_px: Math.max(start.x_px, end.x_px),
    min_y_px: Math.min(start.y_px, end.y_px),
    max_y_px: Math.max(start.y_px, end.y_px),
  })

export const getComponentPresentationHitBounds = (
  component: OpticalComponent,
  camera: Camera2D,
  viewport: ViewportSize,
): ScreenRect => {
  const center = worldToScreen(
    { x: component.transform.x_mm, y: component.transform.y_mm },
    camera,
    viewport,
  )
  return Object.freeze({
    min_x_px: center.x_px - COMPONENT_PRESENTATION_HIT_RADIUS_PX,
    max_x_px: center.x_px + COMPONENT_PRESENTATION_HIT_RADIUS_PX,
    min_y_px: center.y_px - COMPONENT_PRESENTATION_HIT_RADIUS_PX,
    max_y_px: center.y_px + COMPONENT_PRESENTATION_HIT_RADIUS_PX,
  })
}

/** Closed AABB intersection: touching the presentation hit bounds is a hit. */
export const screenRectsIntersect = (left: ScreenRect, right: ScreenRect): boolean =>
  left.min_x_px <= right.max_x_px &&
  left.max_x_px >= right.min_x_px &&
  left.min_y_px <= right.max_y_px &&
  left.max_y_px >= right.min_y_px

/** Returns stable component IDs in authoritative scene order. */
export const componentsHitByBox = (
  scene: OpticalScene,
  box: ScreenRect,
  camera: Camera2D,
  viewport: ViewportSize,
): readonly ComponentId[] =>
  Object.freeze(
    scene.components
      .filter((component) =>
        screenRectsIntersect(box, getComponentPresentationHitBounds(component, camera, viewport)),
      )
      .map(({ id }) => id),
  )

export const boxSelectionModeFromModifiers = (modifiers: {
  readonly shiftKey: boolean
  readonly ctrlKey: boolean
  readonly metaKey: boolean
}): SelectionMode => {
  if (modifiers.ctrlKey || modifiers.metaKey) return 'toggle'
  if (modifiers.shiftKey) return 'add'
  return 'replace'
}

export type BackgroundGestureKind = 'pan' | 'box-select'

/** Left drag boxes; Space+left or middle drag pans. */
export const backgroundGestureKind = (
  button: number,
  spacePressed: boolean,
): BackgroundGestureKind | null => {
  if (button === 1 || (button === 0 && spacePressed)) return 'pan'
  return button === 0 ? 'box-select' : null
}
