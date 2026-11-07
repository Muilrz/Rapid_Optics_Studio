import { describe, expect, it } from 'vitest'
import { CURRENT_PHASE, PRODUCT_STATUS } from '../src/app/stage'

describe('application stage', () => {
  it('exposes the current project status from a TypeScript module', () => {
    expect(CURRENT_PHASE).toBe(
      'Phase 3F — Studio Integration + Spectrum Preview',
    )
    expect(PRODUCT_STATUS).toBe('V1 under development')
  })
})
