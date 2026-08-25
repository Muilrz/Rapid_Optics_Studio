import { describe, expect, it } from 'vitest'
import { CURRENT_PHASE, PRODUCT_STATUS } from '../src/app/stage'

describe('Phase 0 bootstrap', () => {
  it('exposes the current project status from a TypeScript module', () => {
    expect(CURRENT_PHASE).toBe('Phase 0 — Bootstrap')
    expect(PRODUCT_STATUS).toBe('V1 under development')
  })
})
