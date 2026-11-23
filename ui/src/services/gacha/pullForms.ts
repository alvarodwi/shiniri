export type PullFormKey = 'social' | 'event' | 'ordinary' | 'mold' | 'exchange' | 'extra'

export const PULL_FORMS: readonly { key: PullFormKey; label: string }[] = [
  { key: 'social', label: 'Social' },
  { key: 'event', label: 'Event' },
  { key: 'ordinary', label: 'Ordinary' },
  { key: 'mold', label: 'Mold' },
  { key: 'exchange', label: 'Exchange' },
  { key: 'extra', label: 'Extra' },
]

export const parseForm = (value: unknown): PullFormKey | null =>
  PULL_FORMS.find((f) => f.key === value)?.key ?? null

const STORAGE_KEY = 'shiniri.pullForm'
const FIRST_VISIT: PullFormKey = 'event'

// localStorage itself can throw on access (blocked site data), so it is resolved inside the try.
export function readLastForm(storage?: Pick<Storage, 'getItem'>): PullFormKey {
  try {
    const stored = (storage ?? localStorage).getItem(STORAGE_KEY)
    return parseForm(stored) ?? FIRST_VISIT
  } catch {
    return FIRST_VISIT
  }
}

export function rememberForm(key: PullFormKey, storage?: Pick<Storage, 'setItem'>): void {
  try {
    ;(storage ?? localStorage).setItem(STORAGE_KEY, key)
  } catch {
    // Storage blocked: the page still works, it just forgets the choice.
  }
}

export function allowSwitch(dirty: boolean, confirmFn: (message: string) => boolean): boolean {
  return !dirty || confirmFn('Discard the unsaved entry?')
}
