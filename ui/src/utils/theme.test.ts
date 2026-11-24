import { describe, expect, it } from 'vitest'

import { applyTheme, readTheme, saveTheme } from './theme'

const blocked = () => {
  throw new Error('blocked')
}

describe('readTheme', () => {
  it('prefers a stored theme over the OS', () => {
    expect(readTheme(false, { getItem: () => 'dark' })).toBe('dark')
  })

  it('follows the OS when nothing is stored', () => {
    expect(readTheme(true, { getItem: () => null })).toBe('dark')
    expect(readTheme(false, { getItem: () => null })).toBe('light')
  })

  it('falls back to the OS for a garbage stored value', () => {
    expect(readTheme(true, { getItem: () => 'blue' })).toBe('dark')
  })

  it('falls back to the OS when storage throws', () => {
    expect(readTheme(false, { getItem: blocked })).toBe('light')
  })
})

describe('saveTheme', () => {
  it('writes the theme under shiniri.theme', () => {
    const calls: string[][] = []
    saveTheme('dark', { setItem: (k, v) => calls.push([k, v]) })
    expect(calls).toEqual([['shiniri.theme', 'dark']])
  })

  it('does not throw when storage is blocked', () => {
    expect(() => saveTheme('dark', { setItem: blocked })).not.toThrow()
  })
})

describe('applyTheme', () => {
  it('toggles the dark class on the root', () => {
    const el = document.createElement('html')
    applyTheme('dark', el)
    expect(el.classList.contains('dark')).toBe(true)
    applyTheme('light', el)
    expect(el.classList.contains('dark')).toBe(false)
  })
})
