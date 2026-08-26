import type { Vec2 } from '../../core/optics'

export interface ScreenPoint {
  readonly x_px: number
  readonly y_px: number
}

export interface ViewportSize {
  readonly width_px: number
  readonly height_px: number
}

export interface Camera2D {
  readonly center_mm: Vec2
  readonly zoom_px_per_mm: number
}

export interface WorldBounds {
  readonly min_x_mm: number
  readonly max_x_mm: number
  readonly min_y_mm: number
  readonly max_y_mm: number
}

export const CAMERA_ZOOM_LIMITS = Object.freeze({
  min_px_per_mm: 0.2,
  max_px_per_mm: 12,
})

const assertFinite = (value: number, name: string): void => {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite.`)
}

const assertScreenPoint = (point: ScreenPoint): void => {
  assertFinite(point.x_px, 'Screen X')
  assertFinite(point.y_px, 'Screen Y')
}

const assertViewport = (viewport: ViewportSize): void => {
  assertFinite(viewport.width_px, 'Viewport width')
  assertFinite(viewport.height_px, 'Viewport height')
  if (viewport.width_px <= 0 || viewport.height_px <= 0) {
    throw new RangeError('Viewport dimensions must be positive.')
  }
}

const assertCamera = (camera: Camera2D): void => {
  assertFinite(camera.center_mm.x, 'Camera center X')
  assertFinite(camera.center_mm.y, 'Camera center Y')
  assertFinite(camera.zoom_px_per_mm, 'Camera zoom')
  if (camera.zoom_px_per_mm <= 0) {
    throw new RangeError('Camera zoom must be positive.')
  }
}

export const createViewportSize = (
  width_px: number,
  height_px: number,
): ViewportSize => {
  assertFinite(width_px, 'Viewport width')
  assertFinite(height_px, 'Viewport height')
  if (width_px <= 0 || height_px <= 0) {
    throw new RangeError('Viewport dimensions must be positive.')
  }
  return Object.freeze({ width_px, height_px })
}

export const clampCameraZoom = (zoom_px_per_mm: number): number => {
  assertFinite(zoom_px_per_mm, 'Camera zoom')
  return Math.min(
    CAMERA_ZOOM_LIMITS.max_px_per_mm,
    Math.max(CAMERA_ZOOM_LIMITS.min_px_per_mm, zoom_px_per_mm),
  )
}

export const createCamera2D = (
  center_mm: Vec2,
  zoom_px_per_mm: number,
): Camera2D => {
  assertFinite(center_mm.x, 'Camera center X')
  assertFinite(center_mm.y, 'Camera center Y')
  return Object.freeze({
    center_mm: Object.freeze({ x: center_mm.x, y: center_mm.y }),
    zoom_px_per_mm: clampCameraZoom(zoom_px_per_mm),
  })
}

export const worldToScreen = (
  point_mm: Vec2,
  camera: Camera2D,
  viewport: ViewportSize,
): ScreenPoint => {
  assertFinite(point_mm.x, 'World X')
  assertFinite(point_mm.y, 'World Y')
  assertCamera(camera)
  assertViewport(viewport)
  return Object.freeze({
    x_px:
      (point_mm.x - camera.center_mm.x) * camera.zoom_px_per_mm +
      viewport.width_px / 2,
    y_px:
      (camera.center_mm.y - point_mm.y) * camera.zoom_px_per_mm +
      viewport.height_px / 2,
  })
}

export const screenToWorld = (
  point_px: ScreenPoint,
  camera: Camera2D,
  viewport: ViewportSize,
): Vec2 => {
  assertScreenPoint(point_px)
  assertCamera(camera)
  assertViewport(viewport)
  return Object.freeze({
    x:
      camera.center_mm.x +
      (point_px.x_px - viewport.width_px / 2) / camera.zoom_px_per_mm,
    y:
      camera.center_mm.y -
      (point_px.y_px - viewport.height_px / 2) / camera.zoom_px_per_mm,
  })
}

/** Screen drag delta moves the world with the pointer without scene mutation. */
export const panCamera = (
  camera: Camera2D,
  delta_px: ScreenPoint,
): Camera2D => {
  assertScreenPoint(delta_px)
  assertCamera(camera)
  return createCamera2D(
    {
      x: camera.center_mm.x - delta_px.x_px / camera.zoom_px_per_mm,
      y: camera.center_mm.y + delta_px.y_px / camera.zoom_px_per_mm,
    },
    camera.zoom_px_per_mm,
  )
}

export const zoomCameraAtScreenPoint = (
  camera: Camera2D,
  viewport: ViewportSize,
  anchor_px: ScreenPoint,
  zoomFactor: number,
): Camera2D => {
  assertScreenPoint(anchor_px)
  assertCamera(camera)
  assertViewport(viewport)
  assertFinite(zoomFactor, 'Zoom factor')
  if (zoomFactor <= 0) throw new RangeError('Zoom factor must be positive.')

  const anchorWorld = screenToWorld(anchor_px, camera, viewport)
  const zoom_px_per_mm = clampCameraZoom(
    camera.zoom_px_per_mm * zoomFactor,
  )
  return createCamera2D(
    {
      x:
        anchorWorld.x -
        (anchor_px.x_px - viewport.width_px / 2) / zoom_px_per_mm,
      y:
        anchorWorld.y +
        (anchor_px.y_px - viewport.height_px / 2) / zoom_px_per_mm,
    },
    zoom_px_per_mm,
  )
}

export const fitWorldBounds = (
  bounds: WorldBounds,
  viewport: ViewportSize,
  padding_px = 56,
): Camera2D => {
  assertViewport(viewport)
  for (const [name, value] of Object.entries(bounds)) {
    assertFinite(value, `World bound ${name}`)
  }
  assertFinite(padding_px, 'Camera fit padding')
  if (padding_px < 0) throw new RangeError('Camera fit padding cannot be negative.')

  const width_mm = bounds.max_x_mm - bounds.min_x_mm
  const height_mm = bounds.max_y_mm - bounds.min_y_mm
  if (width_mm <= 0 || height_mm <= 0) {
    throw new RangeError('World bounds must have positive width and height.')
  }
  const availableWidth = Math.max(1, viewport.width_px - padding_px * 2)
  const availableHeight = Math.max(1, viewport.height_px - padding_px * 2)

  return createCamera2D(
    {
      x: (bounds.min_x_mm + bounds.max_x_mm) / 2,
      y: (bounds.min_y_mm + bounds.max_y_mm) / 2,
    },
    Math.min(availableWidth / width_mm, availableHeight / height_mm),
  )
}
