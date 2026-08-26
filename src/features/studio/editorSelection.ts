import type { ComponentId, OpticalScene } from '../../core/optics'

export type SelectionMode = 'replace' | 'toggle'

export interface StudioSelection {
  readonly selectedComponentIds: readonly ComponentId[]
  readonly primaryComponentId: ComponentId | null
}

export const EMPTY_STUDIO_SELECTION: StudioSelection = Object.freeze({
  selectedComponentIds: Object.freeze([]),
  primaryComponentId: null,
})

const sceneOrderedIds = (
  scene: OpticalScene,
  ids: ReadonlySet<ComponentId>,
): readonly ComponentId[] =>
  Object.freeze(
    scene.components
      .filter((component) => ids.has(component.id))
      .map((component) => component.id),
  )

/**
 * Selection is always stored in scene order. If a primary component disappears,
 * the last remaining scene-ordered component becomes primary deterministically.
 */
export const reconcileSelection = (
  scene: OpticalScene,
  selectedComponentIds: readonly ComponentId[],
  primaryComponentId: ComponentId | null,
): StudioSelection => {
  const ordered = sceneOrderedIds(scene, new Set(selectedComponentIds))
  const primary =
    primaryComponentId && ordered.includes(primaryComponentId)
      ? primaryComponentId
      : (ordered.at(-1) ?? null)
  return Object.freeze({ selectedComponentIds: ordered, primaryComponentId: primary })
}

export const updateSelection = (
  scene: OpticalScene,
  current: StudioSelection,
  componentId: ComponentId | null,
  mode: SelectionMode,
): StudioSelection => {
  if (componentId === null) return EMPTY_STUDIO_SELECTION
  if (!scene.components.some(({ id }) => id === componentId)) {
    throw new RangeError(`Unknown component ID: ${componentId}`)
  }
  if (mode === 'replace') {
    return Object.freeze({
      selectedComponentIds: Object.freeze([componentId]),
      primaryComponentId: componentId,
    })
  }

  const ids = new Set(current.selectedComponentIds)
  const removing = ids.delete(componentId)
  if (!removing) ids.add(componentId)
  const ordered = sceneOrderedIds(scene, ids)
  const primary = removing
    ? current.primaryComponentId === componentId
      ? (ordered.at(-1) ?? null)
      : current.primaryComponentId
    : componentId
  return Object.freeze({ selectedComponentIds: ordered, primaryComponentId: primary })
}
