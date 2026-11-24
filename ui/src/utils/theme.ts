import { ref } from 'vue'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'shiniri.theme'

// index.html carries a copy of this read (it must run before first paint); keep the two in step.
// localStorage itself can throw on access (blocked site data), so it is resolved inside the try.
export function readTheme(prefersDark: boolean, storage?: Pick<Storage, 'getItem'>): Theme {
  try {
    const stored = (storage ?? localStorage).getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // Storage blocked: follow the OS.
  }
  return prefersDark ? 'dark' : 'light'
}

export function saveTheme(theme: Theme, storage?: Pick<Storage, 'setItem'>): void {
  try {
    ;(storage ?? localStorage).setItem(STORAGE_KEY, theme)
  } catch {
    // Storage blocked: the toggle still works, it just forgets the choice.
  }
}

export function applyTheme(theme: Theme, root: HTMLElement = document.documentElement): void {
  root.classList.toggle('dark', theme === 'dark')
}

// One shared state, so every caller sees the same theme.
const theme = ref<Theme>(
  readTheme(typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches),
)

export function useTheme() {
  applyTheme(theme.value)
  function toggle() {
    theme.value = theme.value === 'dark' ? 'light' : 'dark'
    applyTheme(theme.value)
    saveTheme(theme.value)
  }
  return { theme, toggle }
}
