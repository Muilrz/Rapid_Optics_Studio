import { describe, expect, it } from 'vitest'
import { Transform2DSchema } from '../../src/core/optics'
import {
  createCamera2D,
  createViewportSize,
  screenToWorld,
  worldToScreen,
} from '../../src/features/studio/camera'
import {
  COMPONENT_EDITABILITY_POLICY,
  moveTransformFromWorldPointers,
  normalizeEditorAngleDeg,
  rotateTransformTowardWorldPointer,
  rotationDegFromWorldPointer,
  snapCoordinateToGrid,
  snapWorldPoint,
} from '../../src/features/studio/editorMath'

const transform = Transform2DSchema.parse({
  x_mm: 200,
  y_mm: -75,
  rotation_deg: -45,
})
const viewport = createViewportSize(1000, 600)

describe('Studio editor math', () => {
  it('snaps world coordinates to the default 25 mm grid', () => {
    expect(snapWorldPoint({ x: 111, y: -139 }, 25)).toEqual({
      x: 100,
      y: -150,
    })
    expect(snapCoordinateToGrid(61, 25)).toBe(50)
  })

  it('handles negative coordinates and half-grid ties deterministically', () => {
    expect(snapCoordinateToGrid(-13, 25)).toBe(-25)
    expect(snapCoordinateToGrid(-12.5, 25)).toBe(0)
    expect(snapCoordinateToGrid(12.5, 25)).toBe(25)
    expect(snapCoordinateToGrid(112.5, 25, 100)).toBe(125)
  })

  it('moves continuously when snap is off and preserves rotation', () => {
    const moved = moveTransformFromWorldPointers(
      transform,
      { x: 202, y: -74 },
      { x: 233.25, y: -92.5 },
    )

    expect(moved).toEqual({
      x_mm: 231.25,
      y_mm: -93.5,
      rotation_deg: -45,
    })
  })

  it('applies position snap in world space after pointer movement', () => {
    const moved = moveTransformFromWorldPointers(
      transform,
      { x: 200, y: -75 },
      { x: 214, y: -89 },
      { pitch_mm: 25, origin_mm: { x: 0, y: 0 } },
    )

    expect(moved).toEqual({
      x_mm: 225,
      y_mm: -100,
      rotation_deg: -45,
    })
  })

  it('produces the same world move after different camera pan and zoom', () => {
    const pointerStart = { x: 202, y: -74 }
    const pointerEnd = { x: 233.25, y: -92.5 }
    const cameras = [
      createCamera2D({ x: 0, y: 0 }, 1),
      createCamera2D({ x: 175, y: -120 }, 5.5),
    ]

    const results = cameras.map((camera) =>
      moveTransformFromWorldPointers(
        transform,
        screenToWorld(
          worldToScreen(pointerStart, camera, viewport),
          camera,
          viewport,
        ),
        screenToWorld(
          worldToScreen(pointerEnd, camera, viewport),
          camera,
          viewport,
        ),
      ),
    )

    expect(results[0].x_mm).toBeCloseTo(results[1].x_mm, 12)
    expect(results[0].y_mm).toBeCloseTo(results[1].y_mm, 12)
    expect(results[0].rotation_deg).toBe(results[1].rotation_deg)
  })

  it('uses the Phase 1 positive-CCW world rotation convention', () => {
    const center = { x: 10, y: -20 }

    expect(rotationDegFromWorldPointer(center, { x: 20, y: -20 })).toBe(0)
    expect(rotationDegFromWorldPointer(center, { x: 10, y: -10 })).toBe(90)
    expect(rotationDegFromWorldPointer(center, { x: 10, y: -30 })).toBe(-90)
  })

  it('keeps rotation independent from camera pan, zoom, and screen Y direction', () => {
    const center = { x: 200, y: -75 }
    const pointer = { x: 200, y: -25 }
    const cameras = [
      createCamera2D({ x: 0, y: 0 }, 0.8),
      createCamera2D({ x: 250, y: -150 }, 7),
    ]

    for (const camera of cameras) {
      const centerScreen = worldToScreen(center, camera, viewport)
      const pointerScreen = worldToScreen(pointer, camera, viewport)
      expect(pointerScreen.y_px).toBeLessThan(centerScreen.y_px)
      const pointerWorld = screenToWorld(pointerScreen, camera, viewport)
      expect(
        rotateTransformTowardWorldPointer(transform, pointerWorld)
          .rotation_deg,
      ).toBe(90)
    }
  })

  it('normalizes angles to [-180, 180) across the wrap boundary', () => {
    expect(normalizeEditorAngleDeg(180)).toBe(-180)
    expect(normalizeEditorAngleDeg(181)).toBe(-179)
    expect(normalizeEditorAngleDeg(-181)).toBe(179)
    expect(normalizeEditorAngleDeg(540)).toBe(-180)
  })

  it('declares all ten transforms editable without consulting visualization', () => {
    expect(Object.keys(COMPONENT_EDITABILITY_POLICY)).toHaveLength(10)
    for (const policy of Object.values(COMPONENT_EDITABILITY_POLICY)) {
      expect(policy).toEqual({
        selectable: true,
        movable: true,
        rotatable: true,
      })
    }
  })

  it('rejects invalid grid and degenerate rotation inputs', () => {
    expect(() => snapCoordinateToGrid(1, 0)).toThrow(RangeError)
    expect(() => snapCoordinateToGrid(Number.NaN, 25)).toThrow(RangeError)
    expect(() =>
      rotationDegFromWorldPointer({ x: 1, y: 1 }, { x: 1, y: 1 }),
    ).toThrow(RangeError)
  })
})
