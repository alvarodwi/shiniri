import { describe, expect, it } from 'vitest'

import { ssrPool } from './nikkePool'

import type { Nikke } from '@/services/nikke/nikkeDatabase'

const nikke = (name: string, rarity: string, manufacturer: string): Nikke => ({
  nameCode: name,
  name,
  rarity,
  manufacturer,
  class: '',
  burst: '',
  element: '',
  weapon: '',
  resourceId: '',
  releaseDate: '',
})

const all = [
  nikke('Biscuit', 'SSR', 'TETRA'),
  nikke('Pilgrim One', 'SSR', 'Pilgrim'),
  nikke('Collab One', 'SSR', 'ABNORMAL'),
  nikke('Rookie', 'SR', 'TETRA'),
]
const names = (ns: Nikke[]) => ns.map((n) => n.name)

describe('ssrPool', () => {
  it('keeps only plain SSRs when nothing special is allowed', () => {
    expect(names(ssrPool(all, { pilgrim: false, abnormal: false }))).toEqual(['Biscuit'])
  })

  it('adds Pilgrim when allowed, not Abnormal', () => {
    expect(names(ssrPool(all, { pilgrim: true, abnormal: false }))).toEqual([
      'Biscuit',
      'Pilgrim One',
    ])
  })

  it('adds Abnormal too when allowed, and never an SR', () => {
    expect(names(ssrPool(all, { pilgrim: true, abnormal: true }))).toEqual([
      'Biscuit',
      'Pilgrim One',
      'Collab One',
    ])
  })
})
