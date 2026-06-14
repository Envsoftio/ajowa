export type ThemeMode = 'light' | 'dark' | 'system'

export const useTheme = () => {
  const mode = useCookie<ThemeMode>('ajowa-theme', {
    default: () => 'system',
    sameSite: 'lax',
  })
  const isDark = useState('theme:is-dark', () => false)

  const resolveSystemPreference = () => {
    if (!import.meta.client) {
      return false
    }

    return window.matchMedia('(prefers-color-scheme: dark)').matches
  }

  const apply = (nextMode: ThemeMode) => {
    mode.value = nextMode
    isDark.value = nextMode === 'system' ? resolveSystemPreference() : nextMode === 'dark'
  }

  const toggle = () => {
    apply(isDark.value ? 'light' : 'dark')
  }

  if (import.meta.client) {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    if (mode.value === 'system') {
      isDark.value = mediaQuery.matches
    }

    mediaQuery.addEventListener('change', (event) => {
      if (mode.value === 'system') {
        isDark.value = event.matches
      }
    })
  }

  return {
    mode,
    isDark,
    apply,
    toggle,
  }
}
