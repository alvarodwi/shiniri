import { describe, expect, it, vi } from 'vitest'

import { PULL_FORMS, allowSwitch, parseForm, readLastForm, rememberForm } from './pullForms'

const reading = (value: string | null) => ({ getItem: () => value })
const throwing = () => {
  throw new Error('blocked')
}

describe('PULL_FORMS', () => {
  it('lists the six forms in order', () => {
    expect(PULL_FORMS.map((f) => f.key)).toEqual([
      'social',
      'event',
      'ordinary',
      'mold',
      'exchange',
      'extra',
    ])
  })
})

describe('readLastForm', () => {
  it('defaults to event when nothing is stored', () => {
    expect(readLastForm(reading(null))).toBe('event')
  })
  it('defaults to event for an unknown stored key', () => {
    expect(readLastForm(reading('special'))).toBe('event')
  })
  it('defaults to event when storage throws', () => {
    expect(readLastForm({ getItem: throwing })).toBe('event')
  })
  it('returns a valid stored key', () => {
    expect(readLastForm(reading('mold'))).toBe('mold')
  })
})

describe('rememberForm', () => {
  it('stores the key', () => {
    const setItem = vi.fn()
    rememberForm('extra', { setItem })
    expect(setItem).toHaveBeenCalledWith('shiniri.pullForm', 'extra')
  })
  it('swallows a throwing storage', () => {
    expect(() => rememberForm('extra', { setItem: throwing })).not.toThrow()
  })
})

describe('allowSwitch', () => {
  it('allows a clean form without asking', () => {
    const ask = vi.fn(() => false)
    expect(allowSwitch(false, ask)).toBe(true)
    expect(ask).not.toHaveBeenCalled()
  })
  it('follows the answer for a dirty form', () => {
    expect(allowSwitch(true, () => true)).toBe(true)
    expect(allowSwitch(true, () => false)).toBe(false)
  })
})

describe('blocked site data', () => {
  it('falls back and does not throw when reading window.localStorage itself throws', () => {
    const real = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')!
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: throwing })
    try {
      expect(readLastForm()).toBe('event')
      expect(() => rememberForm('mold')).not.toThrow()
    } finally {
      Object.defineProperty(globalThis, 'localStorage', real)
    }
  })
})

describe('parseForm', () => {
  it('accepts a form key and rejects anything else', () => {
    expect(parseForm('mold')).toBe('mold')
    expect(parseForm('special')).toBeNull()
    expect(parseForm(undefined)).toBeNull()
    expect(parseForm(['mold'])).toBeNull()
  })
})
