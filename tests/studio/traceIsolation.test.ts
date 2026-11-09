import { expect, it, vi } from 'vitest'
import * as optics from '../../src/core/optics'
import { captureProject } from '../../src/project/studioProject'
import { createStudioStore } from '../../src/store/studioStore'

it('keeps an edited scene recoverable and rejects a project whose trace throws', () => {
  const store = createStudioStore()
  const before = store.getState()
  const mirror = before.authoritative.scene.components.find(({ type }) => type === 'mirror')!
  const trace = vi.spyOn(optics, 'traceOpticalScene').mockImplementation(() => { throw new Error('Injected trace failure') })
  try {
    before.updateComponentTransform(mirror.id, optics.Transform2DSchema.parse({ ...mirror.transform, rotation_deg: 2 }))
    const edited = store.getState()
    expect(edited.authoritative.revision).toBe(before.authoritative.revision + 1)
    expect(edited.derived).toMatchObject({ traceFailure: 'Injected trace failure', spectrum: { kind: 'unavailable' } })
    expect(() => edited.replaceProject(captureProject(before))).toThrow('Project trace failed')
    expect(store.getState()).toBe(edited)
  } finally { trace.mockRestore() }
  store.getState().undo()
  expect(store.getState().derived.traceFailure).toBeUndefined()
  expect(store.getState().derived.spectrum.kind).toBe('ready')
})
