export type StudioGestureKind = 'pan' | 'move' | 'rotate' | 'box-select'
export type StudioGestureSettlementTrigger = 'complete' | 'pointercancel' | 'escape'

export interface StudioGestureSettlement {
  readonly historyAction: 'none' | 'commit' | 'cancel'
  readonly clearSelection: boolean
  readonly clearMarquee: boolean
  /** A settled gesture always returns the editor to its idle gesture state. */
  readonly nextGesture: null
}

export const settleStudioGesture = (
  kind: StudioGestureKind | null,
  trigger: StudioGestureSettlementTrigger,
): StudioGestureSettlement => {
  const designGesture = kind === 'move' || kind === 'rotate'
  return Object.freeze({
    historyAction: designGesture
      ? trigger === 'complete'
        ? 'commit'
        : 'cancel'
      : 'none',
    clearSelection: kind === null && trigger === 'escape',
    clearMarquee: kind === 'box-select',
    nextGesture: null,
  })
}
