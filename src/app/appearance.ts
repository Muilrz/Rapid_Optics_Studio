import { useEffect, useLayoutEffect, useState } from 'react'

export type Appearance = 'light' | 'dark'
export type AppearancePreference = Appearance | 'system'

export const APPEARANCE_STORAGE_KEY = 'rapid-optics-studio.appearance'

/** Explicit choices win; otherwise follow the operating-system preference. */
export function resolveAppearance(
  preference: AppearancePreference,
  systemPrefersDark: boolean,
): Appearance {
  return preference === 'system'
    ? systemPrefersDark ? 'dark' : 'light'
    : preference
}

export function parseAppearancePreference(value: string | null): AppearancePreference {
  return value === 'light' || value === 'dark' ? value : 'system'
}

function savedPreference(): AppearancePreference {
  if (typeof window === 'undefined') return 'system'
  try {
    return parseAppearancePreference(window.localStorage.getItem(APPEARANCE_STORAGE_KEY))
  } catch {
    return 'system'
  }
}

function prefersDark(): boolean {
  return typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
}

/**
 * Initial appearance follows the OS until the user makes a choice. A manual
 * choice persists across reloads. Visual preference never enters project state.
 */
export function useAppearance() {
  const [preference, setPreference] = useState<AppearancePreference>(savedPreference)
  const [systemDark, setSystemDark] = useState(prefersDark)
  const appearance = resolveAppearance(preference, systemDark)

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  // Layout effect prevents an intermediate wrong-color frame on theme switches.
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = appearance
    document.documentElement.style.colorScheme = appearance
    try {
      if (preference === 'system') window.localStorage.removeItem(APPEARANCE_STORAGE_KEY)
      else window.localStorage.setItem(APPEARANCE_STORAGE_KEY, preference)
    } catch {
      // Storage can be unavailable in private/sandboxed browsing contexts.
    }
  }, [appearance, preference])

  const toggleAppearance = () => {
    setPreference(appearance === 'dark' ? 'light' : 'dark')
  }

  return { appearance, toggleAppearance }
}
