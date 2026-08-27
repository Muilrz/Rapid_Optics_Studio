import type { ComponentId, OpticalComponent, OpticalScene } from '../../core/optics'

export type SelectionMode = 'replace' | 'add' | 'toggle'

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

  if (mode === 'add') {
    return updateSelectionSet(scene, current, [componentId], mode)
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

/**
 * Applies a deterministic scene-ordered selection update for marquee and other
 * multi-target selection gestures. The last scene-ordered added hit becomes
 * primary; removing hits never leaves a stale primary ID.
 */
export const updateSelectionSet = (
  scene: OpticalScene,
  current: StudioSelection,
  componentIds: readonly ComponentId[],
  mode: SelectionMode,
): StudioSelection => {
  const hits = sceneOrderedIds(scene, new Set(componentIds))
  if (mode === 'replace') {
    return Object.freeze({
      selectedComponentIds: hits,
      primaryComponentId: hits.at(-1) ?? null,
    })
  }

  const ids = new Set(current.selectedComponentIds)
  if (mode === 'add') {
    for (const id of hits) ids.add(id)
  } else {
    for (const id of hits) {
      if (!ids.delete(id)) ids.add(id)
    }
  }

  const ordered = sceneOrderedIds(scene, ids)
  const lastAddedHit = [...hits].reverse().find((id) => ids.has(id))
  const primary =
    lastAddedHit ??
    (current.primaryComponentId && ids.has(current.primaryComponentId)
      ? current.primaryComponentId
      : (ordered.at(-1) ?? null))
  return Object.freeze({ selectedComponentIds: ordered, primaryComponentId: primary })
}

/** Shared mixed-lock policy: locked members stay selected but are ineligible to move. */
export const unlockedSelectedComponents = (
  scene: OpticalScene,
  selectedComponentIds: readonly ComponentId[],
  lockedComponentIds: readonly ComponentId[],
): readonly OpticalComponent[] => {
  const selected = new Set(selectedComponentIds)
  const locked = new Set(lockedComponentIds)
  return Object.freeze(
    scene.components.filter(({ id }) => selected.has(id) && !locked.has(id)),
  )
}
