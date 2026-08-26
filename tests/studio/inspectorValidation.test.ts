import { describe, expect, it } from 'vitest'
import {
  formatInspectorError,
  parseFiniteNumericDraft,
} from '../../src/features/studio/inspectorValidation'
import { BeamSplitterParametersSchema } from '../../src/core/optics'

describe('Property Inspector draft validation', () => {
  it('parses finite numeric drafts without coercing incomplete text', () => {
    expect(parseFiniteNumericDraft('-12.5')).toBe(-12.5)
    expect(parseFiniteNumericDraft(' 0.25 ')).toBe(0.25)
    expect(() => parseFiniteNumericDraft('')).toThrow(/before committing/)
    expect(() => parseFiniteNumericDraft('   ')).toThrow(/before committing/)
    expect(() => parseFiniteNumericDraft('-')).toThrow(/finite/)
    expect(() => parseFiniteNumericDraft('NaN')).toThrow(/finite/)
    expect(() => parseFiniteNumericDraft('Infinity')).toThrow(/finite/)
  })

  it('formats coupled Zod validation as a local field message', () => {
    const result = BeamSplitterParametersSchema.safeParse({
      transmission_ratio: 0.8,
      reflection_ratio: 0.4,
    })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(formatInspectorError(result.error)).toContain('sum to at most 1')
  })
})
