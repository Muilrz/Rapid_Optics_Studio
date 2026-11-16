import { describe, expect, it } from 'vitest'
import {
  APPEARANCE_STORAGE_KEY,
  parseAppearancePreference,
  resolveAppearance,
} from '../../src/app/appearance'

describe('Studio appearance preferences', () => {
  it('supports the two explicit user-selected appearances', () => {
    expect(resolveAppearance('light', true)).toBe('light')
    expect(resolveAppearance('dark', false)).toBe('dark')
  })

  it('uses the OS preference until explicitly overridden', () => {
    expect(resolveAppearance('system', false)).toBe('light')
    expect(resolveAppearance('system', true)).toBe('dark')
  })

  it('does not trust unexpected persisted values', () => {
    expect(parseAppearancePreference('light')).toBe('light')
    expect(parseAppearancePreference('dark')).toBe('dark')
    expect(parseAppearancePreference('solarized')).toBe('system')
    expect(parseAppearancePreference(null)).toBe('system')
    expect(APPEARANCE_STORAGE_KEY).toContain('appearance')
  })
})
