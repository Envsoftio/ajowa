type PersistableState = Record<string, unknown>

type PersistentReactiveStateOptions<T extends PersistableState> = {
  omit?: Array<keyof T>
}

export const usePersistentReactiveState = <T extends PersistableState>(
  key: string,
  state: T,
  options: PersistentReactiveStateOptions<T> = {},
) => {
  const storageKey = `ajowa:persistent-state:${key}`
  const omittedKeys = new Set<string>((options.omit ?? []).map(String))

  const snapshot = () =>
    Object.fromEntries(
      Object.entries(state).filter(([entryKey]) => !omittedKeys.has(entryKey)),
    )

  const restore = () => {
    if (!import.meta.client) return

    try {
      const storedValue = window.localStorage.getItem(storageKey)
      if (!storedValue) return

      const parsedValue = JSON.parse(storedValue)
      if (!parsedValue || typeof parsedValue !== 'object' || Array.isArray(parsedValue)) return

      for (const [entryKey, entryValue] of Object.entries(parsedValue)) {
        if (entryKey in state && !omittedKeys.has(entryKey)) {
          state[entryKey as keyof T] = entryValue as T[keyof T]
        }
      }
    } catch {
      window.localStorage.removeItem(storageKey)
    }
  }

  const persist = () => {
    if (!import.meta.client) return

    try {
      window.localStorage.setItem(storageKey, JSON.stringify(snapshot()))
    } catch {
      // Storage may be unavailable in private browsing or full quota situations.
    }
  }

  restore()

  if (import.meta.client) {
    watch(state, persist, { deep: true })
  }

  return {
    persist,
    restore,
  }
}
