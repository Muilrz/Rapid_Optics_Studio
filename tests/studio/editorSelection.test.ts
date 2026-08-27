import { describe, expect, it } from 'vitest'
import { DEFAULT_RAMAN_SCENE } from '../../src/project/defaults/defaultRamanScene'
import {
  EMPTY_STUDIO_SELECTION,
  reconcileSelection,
  updateSelection,
} from '../../src/features/studio/editorSelection'

describe('Studio multi-selection contract', () => {
  const [laser, mirror, sample] = DEFAULT_RAMAN_SCENE.components

  it('replaces normally and toggles in deterministic scene order', () => {
    if (!laser || !mirror || !sample) throw new Error('Fixture is incomplete.')
    let selection = updateSelection(DEFAULT_RAMAN_SCENE, EMPTY_STUDIO_SELECTION, sample.id, 'replace')
    selection = updateSelection(DEFAULT_RAMAN_SCENE, selection, laser.id, 'toggle')
    selection = updateSelection(DEFAULT_RAMAN_SCENE, selection, mirror.id, 'toggle')

    expect(selection.selectedComponentIds).toEqual([laser.id, mirror.id, sample.id])
    expect(selection.primaryComponentId).toBe(mirror.id)

    selection = updateSelection(DEFAULT_RAMAN_SCENE, selection, mirror.id, 'toggle')
    expect(selection.selectedComponentIds).toEqual([laser.id, sample.id])
    expect(selection.primaryComponentId).toBe(sample.id)
  })

  it('reconciles removed IDs and chooses the last remaining ID as primary', () => {
    if (!laser || !mirror || !sample) throw new Error('Fixture is incomplete.')
    const scene = {
      ...DEFAULT_RAMAN_SCENE,
      components: DEFAULT_RAMAN_SCENE.components.filter(({ id }) => id !== mirror.id),
    }
    expect(reconcileSelection(scene, [sample.id, mirror.id, laser.id], mirror.id)).toEqual({
      selectedComponentIds: [laser.id, sample.id],
      primaryComponentId: sample.id,
    })
  })

  it('preserves selection identity and a valid primary across component reorder', () => {
    if (!laser || !mirror || !sample) throw new Error('Fixture is incomplete.')
    const reordered = {
      ...DEFAULT_RAMAN_SCENE,
      components: [...DEFAULT_RAMAN_SCENE.components].reverse(),
    }
    const selection = reconcileSelection(
      reordered,
      [laser.id, mirror.id, sample.id],
      mirror.id,
    )

    expect(new Set(selection.selectedComponentIds)).toEqual(
      new Set([laser.id, mirror.id, sample.id]),
    )
    expect(selection.primaryComponentId).toBe(mirror.id)
    expect(selection.selectedComponentIds).toContain(selection.primaryComponentId)
  })
})
