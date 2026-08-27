import { describe, expect, it } from 'vitest'
import { settleStudioGesture } from '../../src/features/studio/gesturePolicy'

describe('Studio gesture settlement policy', () => {
  it.each(['move', 'rotate'] as const)(
    'cancels %s design history on pointercancel and cannot leave a stuck gesture',
    (kind) => {
      expect(settleStudioGesture(kind, 'pointercancel')).toEqual({
        historyAction: 'cancel',
        clearSelection: false,
        clearMarquee: false,
        nextGesture: null,
      })
    },
  )

  it('cancels an active design gesture on Escape without discarding selection', () => {
    expect(settleStudioGesture('move', 'escape')).toEqual({
      historyAction: 'cancel',
      clearSelection: false,
      clearMarquee: false,
      nextGesture: null,
    })
  })

  it('clears only the marquee on cancelled box select and idles safely', () => {
    expect(settleStudioGesture('box-select', 'pointercancel')).toEqual({
      historyAction: 'none',
      clearSelection: false,
      clearMarquee: true,
      nextGesture: null,
    })
  })

  it('commits completed design gestures and leaves pan outside design history', () => {
    expect(settleStudioGesture('rotate', 'complete').historyAction).toBe('commit')
    expect(settleStudioGesture('pan', 'complete')).toEqual({
      historyAction: 'none',
      clearSelection: false,
      clearMarquee: false,
      nextGesture: null,
    })
  })

  it('uses idle Escape to clear selection without touching history', () => {
    expect(settleStudioGesture(null, 'escape')).toEqual({
      historyAction: 'none',
      clearSelection: true,
      clearMarquee: false,
      nextGesture: null,
    })
  })
})
