import { describe, expect, it } from 'vitest'
import { CURRENT_PHASE, PRODUCT_STATUS } from '../src/app/stage'

describe('application stage', () => {
  it('exposes the current project status from a TypeScript module', () => {
    expect(CURRENT_PHASE).toBe(
      'Phase 2C — Component Library + Add/Delete + Property Inspector',
    )
    expect(PRODUCT_STATUS).toBe('V1 under development')
  })
})
