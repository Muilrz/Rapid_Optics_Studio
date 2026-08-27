import { describe, expect, it } from 'vitest'
import { OpticalSceneSchema } from '../../src/core/optics'
import {
  COMPONENT_PRESENTATION_HIT_RADIUS_PX,
  backgroundGestureKind,
  boxSelectionModeFromModifiers,
  componentsHitByBox,
  createScreenRect,
  getComponentPresentationHitBounds,
} from '../../src/features/studio/boxSelection'
import {
  createCamera2D,
  createViewportSize,
  worldToScreen,
} from '../../src/features/studio/camera'
import {
  EMPTY_STUDIO_SELECTION,
  unlockedSelectedComponents,
  updateSelectionSet,
} from '../../src/features/studio/editorSelection'
import { DEFAULT_RAMAN_SCENE } from '../../src/project/defaults/defaultRamanScene'
import { createStudioStore } from '../../src/store/studioStore'

const viewport = createViewportSize(1000, 600)

describe('Studio box selection', () => {
  it('uses closed presentation hit bounds in stable scene order', () => {
    const camera = createCamera2D({ x: 250, y: -150 }, 2)
    const component = DEFAULT_RAMAN_SCENE.components[0]!
    const center = worldToScreen(
      { x: component.transform.x_mm, y: component.transform.y_mm },
      camera,
      viewport,
    )
    const touching = createScreenRect(
      {
        x_px: center.x_px + COMPONENT_PRESENTATION_HIT_RADIUS_PX,
        y_px: center.y_px,
      },
      {
        x_px: center.x_px + COMPONENT_PRESENTATION_HIT_RADIUS_PX + 12,
        y_px: center.y_px + 4,
      },
    )

    expect(componentsHitByBox(DEFAULT_RAMAN_SCENE, touching, camera, viewport)[0]).toBe(
      component.id,
    )
    expect(getComponentPresentationHitBounds(component, camera, viewport)).toEqual({
      min_x_px: center.x_px - 30,
      max_x_px: center.x_px + 30,
      min_y_px: center.y_px - 30,
      max_y_px: center.y_px + 30,
    })
  })

  it('is correct after camera pan/zoom and does not use optical aperture', () => {
    const mirror = DEFAULT_RAMAN_SCENE.components.find(({ type }) => type === 'mirror')!
    const apertures = [0.1, 10_000]
    const cameras = [
      createCamera2D({ x: 0, y: 0 }, 0.5),
      createCamera2D({ x: 210, y: -70 }, 7),
    ]

    for (const aperture_mm of apertures) {
      const scene = OpticalSceneSchema.parse({
        ...DEFAULT_RAMAN_SCENE,
        components: DEFAULT_RAMAN_SCENE.components.map((component) =>
          component.id === mirror.id
            ? { ...component, geometry: { aperture_mm } }
            : component,
        ),
      })
      for (const camera of cameras) {
        const center = worldToScreen(
          { x: mirror.transform.x_mm, y: mirror.transform.y_mm },
          camera,
          viewport,
        )
        const box = createScreenRect(
          { x_px: center.x_px - 2, y_px: center.y_px - 2 },
          { x_px: center.x_px + 2, y_px: center.y_px + 2 },
        )
        expect(componentsHitByBox(scene, box, camera, viewport)).toContain(mirror.id)
      }
    }
  })

  it('selects disabled and locked components and returns empty for an empty box', () => {
    const mirror = DEFAULT_RAMAN_SCENE.components.find(({ type }) => type === 'mirror')!
    const scene = OpticalSceneSchema.parse({
      ...DEFAULT_RAMAN_SCENE,
      components: DEFAULT_RAMAN_SCENE.components.map((component) =>
        component.id === mirror.id ? { ...component, enabled: false } : component,
      ),
    })
    const store = createStudioStore(scene)
    store.getState().setComponentLocked(mirror.id, true)
    const camera = createCamera2D(
      { x: mirror.transform.x_mm, y: mirror.transform.y_mm },
      2,
    )
    const center = worldToScreen(
      { x: mirror.transform.x_mm, y: mirror.transform.y_mm },
      camera,
      viewport,
    )

    expect(
      componentsHitByBox(
        scene,
        createScreenRect(center, center),
        camera,
        viewport,
      ),
    ).toContain(mirror.id)
    expect(
      componentsHitByBox(
        scene,
        createScreenRect({ x_px: -1000, y_px: -1000 }, { x_px: -900, y_px: -900 }),
        camera,
        viewport,
      ),
    ).toEqual([])
  })

  it('supports replace, additive, and toggle marquee selection deterministically', () => {
    const [laser, mirror, sample] = DEFAULT_RAMAN_SCENE.components
    if (!laser || !mirror || !sample) throw new Error('Fixture is incomplete.')
    const replaced = updateSelectionSet(
      DEFAULT_RAMAN_SCENE,
      EMPTY_STUDIO_SELECTION,
      [sample.id, laser.id],
      'replace',
    )
    const added = updateSelectionSet(DEFAULT_RAMAN_SCENE, replaced, [mirror.id], 'add')
    const toggled = updateSelectionSet(
      DEFAULT_RAMAN_SCENE,
      added,
      [sample.id, mirror.id],
      'toggle',
    )

    expect(replaced.selectedComponentIds).toEqual([laser.id, sample.id])
    expect(added.selectedComponentIds).toEqual([laser.id, mirror.id, sample.id])
    expect(toggled.selectedComponentIds).toEqual([laser.id])
    expect(toggled.primaryComponentId).toBe(laser.id)
  })

  it('defines non-conflicting background gestures and mixed-lock group eligibility', () => {
    expect(backgroundGestureKind(0, false)).toBe('box-select')
    expect(backgroundGestureKind(0, true)).toBe('pan')
    expect(backgroundGestureKind(1, false)).toBe('pan')
    expect(backgroundGestureKind(2, false)).toBeNull()
    expect(boxSelectionModeFromModifiers({ shiftKey: true, ctrlKey: false, metaKey: false })).toBe('add')
    expect(boxSelectionModeFromModifiers({ shiftKey: true, ctrlKey: true, metaKey: false })).toBe('toggle')

    const [laser, mirror] = DEFAULT_RAMAN_SCENE.components
    if (!laser || !mirror) throw new Error('Fixture is incomplete.')
    expect(
      unlockedSelectedComponents(
        DEFAULT_RAMAN_SCENE,
        [laser.id, mirror.id],
        [mirror.id],
      ).map(({ id }) => id),
    ).toEqual([laser.id])
  })
})
