import { describe, expect, it } from 'vitest'
import {
  CAMERA_ZOOM_LIMITS,
  createCamera2D,
  createViewportSize,
  fitWorldBounds,
  panCamera,
  screenToWorld,
  worldToScreen,
  zoomCameraAtScreenPoint,
} from '../../src/features/studio/camera'

const viewport = createViewportSize(1000, 600)

describe('Studio camera', () => {
  it('maps the +Y-up millimeter world into +Y-down screen pixels', () => {
    const camera = createCamera2D({ x: 10, y: -20 }, 2)

    expect(worldToScreen({ x: 10, y: -20 }, camera, viewport)).toEqual({
      x_px: 500,
      y_px: 300,
    })
    expect(worldToScreen({ x: 20, y: -10 }, camera, viewport)).toEqual({
      x_px: 520,
      y_px: 280,
    })
  })

  it('round-trips world and screen coordinates without changing units', () => {
    const camera = createCamera2D({ x: 41.5, y: -72.25 }, 3.4)
    const world = { x: 237.125, y: -113.75 }

    const restored = screenToWorld(
      worldToScreen(world, camera, viewport),
      camera,
      viewport,
    )

    expect(restored.x).toBeCloseTo(world.x, 12)
    expect(restored.y).toBeCloseTo(world.y, 12)
  })

  it('pans the camera so the rendered world follows the screen drag', () => {
    const camera = createCamera2D({ x: 0, y: 0 }, 2)
    const moved = panCamera(camera, { x_px: 40, y_px: -20 })

    expect(moved.center_mm).toEqual({ x: -20, y: -10 })
    expect(camera.center_mm).toEqual({ x: 0, y: 0 })
  })

  it('keeps the pointer-anchored world position fixed while zooming', () => {
    const camera = createCamera2D({ x: 100, y: -50 }, 1.5)
    const anchor = { x_px: 760, y_px: 130 }
    const before = screenToWorld(anchor, camera, viewport)
    const zoomed = zoomCameraAtScreenPoint(camera, viewport, anchor, 2.25)
    const after = screenToWorld(anchor, zoomed, viewport)

    expect(after.x).toBeCloseTo(before.x, 12)
    expect(after.y).toBeCloseTo(before.y, 12)
    expect(zoomed.zoom_px_per_mm).toBeCloseTo(3.375)
  })

  it('clamps zoom at the shared view limits', () => {
    const camera = createCamera2D({ x: 0, y: 0 }, 1)
    const anchor = { x_px: 500, y_px: 300 }

    expect(
      zoomCameraAtScreenPoint(camera, viewport, anchor, 1e9).zoom_px_per_mm,
    ).toBe(CAMERA_ZOOM_LIMITS.max_px_per_mm)
    expect(
      zoomCameraAtScreenPoint(camera, viewport, anchor, 1e-9).zoom_px_per_mm,
    ).toBe(CAMERA_ZOOM_LIMITS.min_px_per_mm)
  })

  it('fits formal world bounds and remains centered after viewport resize', () => {
    const bounds = {
      min_x_mm: 0,
      max_x_mm: 500,
      min_y_mm: -300,
      max_y_mm: 0,
    }
    const fitted = fitWorldBounds(bounds, viewport, 50)
    const resized = createViewportSize(1400, 800)

    expect(fitted.center_mm).toEqual({ x: 250, y: -150 })
    expect(worldToScreen(fitted.center_mm, fitted, resized)).toEqual({
      x_px: 700,
      y_px: 400,
    })
  })

  it('rejects non-finite and degenerate runtime inputs', () => {
    expect(() => createViewportSize(0, 600)).toThrow(RangeError)
    expect(() => createViewportSize(Number.NaN, 600)).toThrow(RangeError)
    expect(() => createCamera2D({ x: Number.POSITIVE_INFINITY, y: 0 }, 1)).toThrow(
      RangeError,
    )
    expect(() =>
      worldToScreen(
        { x: 0, y: 0 },
        { center_mm: { x: 0, y: 0 }, zoom_px_per_mm: 0 },
        viewport,
      ),
    ).toThrow(RangeError)
    expect(() =>
      zoomCameraAtScreenPoint(
        createCamera2D({ x: 0, y: 0 }, 1),
        viewport,
        { x_px: 10, y_px: 10 },
        Number.POSITIVE_INFINITY,
      ),
    ).toThrow(RangeError)
  })
})
