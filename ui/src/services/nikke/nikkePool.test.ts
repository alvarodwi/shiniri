import { describe, expect, it } from 'vitest'

import { ssrPool } from './nikkePool'

import type { Nikke } from '@/services/nikke/nikkeDatabase'

const nikke = (name: string, rarity: string, manufacturer: string, overspec = false): Nikke => ({
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
  limited: false,
  overspec,
})

const all = [
  nikke('Biscuit', 'SSR', 'TETRA'),
  nikke('Pilgrim One', 'SSR', 'Pilgrim', true),
  nikke('Overspec Tetra', 'SSR', 'TETRA', true),
  nikke('Collab One', 'SSR', 'ABNORMAL'),
  nikke('Rookie', 'SR', 'TETRA'),
]
const names = (ns: Nikke[]) => ns.map((n) => n.name)

describe('ssrPool', () => {
  it('keeps only plain SSRs when nothing special is allowed', () => {
    expect(names(ssrPool(all, { overspec: false, abnormal: false }))).toEqual(['Biscuit'])
  })

  it('adds overspec when allowed, not Abnormal', () => {
    expect(names(ssrPool(all, { overspec: true, abnormal: false }))).toEqual([
      'Biscuit',
      'Pilgrim One',
      'Overspec Tetra',
    ])
  })

  it('adds Abnormal too when allowed, and never an SR', () => {
    expect(names(ssrPool(all, { overspec: true, abnormal: true }))).toEqual([
      'Biscuit',
      'Pilgrim One',
      'Overspec Tetra',
      'Collab One',
    ])
  })
})
