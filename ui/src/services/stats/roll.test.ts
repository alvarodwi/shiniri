import { describe, expect, it } from 'vitest'

import { rollValues } from './roll'

describe('rollValues', () => {
  it('draws each filter from its own options', () => {
    expect(rollValues({ a: ['x', 'y'], b: ['p', 'q', 'r'] }, () => 0)).toEqual({ a: 'x', b: 'p' })
    expect(rollValues({ a: ['x', 'y'], b: ['p', 'q', 'r'] }, () => 0.99)).toEqual({
      a: 'y',
      b: 'r',
    })
  })
  it('leaves a filter with no options unchosen', () => {
    expect(rollValues({ a: [], b: ['p'] }, () => 0)).toEqual({ b: 'p' })
  })
})
