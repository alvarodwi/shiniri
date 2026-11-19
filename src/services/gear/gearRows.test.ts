import { describe, expect, it } from 'vitest'

import { furnaceRow, gearCode, isCardComplete, newCard, rowsFor, t9ManuRow } from './gearRows'

import type { GearCard, GearItem } from '@/types/gear'

const DATE = '2026-11-19'
const abnSupHelmet: GearItem = {
  manufacturer: 'Abnormal',
  classType: 'Supporter',
  slot: 'Helmet',
}
const abnSupBoots: GearItem = { ...abnSupHelmet, slot: 'Boots' }

const furnaceCard = (): GearCard => ({
  manufacturer: 'Pilgrim',
  classType: 'Defender',
  slot: 'Torso',
  target: 'Pilgrim',
  sacrifices: [abnSupHelmet, abnSupBoots],
})

describe('t9ManuRow', () => {
  it('maps to date | sourceType | classType | manufacturer | slotType', () => {
    expect(
      t9ManuRow(DATE, 'Manufacturer Arms', {
        manufacturer: 'Tetra',
        classType: 'Defender',
        slot: 'Boots',
      }),
    ).toEqual([DATE, 'Manufacturer Arms', 'Defender', 'Tetra', 'Boots'])
  })
})

describe('gearCode', () => {
  it('writes manufacturer-classType-slotType', () => {
    expect(gearCode(abnSupHelmet)).toBe('Abnormal-Supporter-Helmet')
  })
})

describe('furnaceRow', () => {
  it('maps to Date | Target | Sacrifice 1 | Sacrifice 2 | Result', () => {
    expect(furnaceRow(DATE, furnaceCard())).toEqual([
      DATE,
      'Pilgrim',
      'Abnormal-Supporter-Helmet',
      'Abnormal-Supporter-Boots',
      'Pilgrim-Defender-Torso',
    ])
  })
})

describe('isCardComplete', () => {
  it('needs gear and slot for arms and boxes', () => {
    expect(isCardComplete(newCard(), 'arms')).toBe(false)
    expect(isCardComplete({ ...newCard(), ...abnSupHelmet }, 'box')).toBe(true)
    expect(isCardComplete({ ...newCard(), ...abnSupHelmet, slot: null }, 'arms')).toBe(false)
    expect(isCardComplete({ ...newCard(), ...abnSupHelmet, manufacturer: null }, 'arms')).toBe(
      false,
    )
  })

  it('needs target, both sacrifices and a result from the target for furnace', () => {
    expect(isCardComplete(furnaceCard(), 'furnace')).toBe(true)
    expect(isCardComplete({ ...furnaceCard(), target: null }, 'furnace')).toBe(false)
    expect(isCardComplete({ ...furnaceCard(), target: 'Tetra' }, 'furnace')).toBe(false)
    expect(
      isCardComplete({ ...furnaceCard(), sacrifices: [abnSupHelmet, newCard()] }, 'furnace'),
    ).toBe(false)
  })
})

describe('rowsFor', () => {
  it('writes furnace attempts to both tabs, manufacturer from the target', () => {
    const { t9Manu, furnace } = rowsFor(DATE, 'furnace', [furnaceCard(), furnaceCard()])
    expect(t9Manu).toEqual([
      [DATE, 'Manufacturer Arms Furnace', 'Defender', 'Pilgrim', 'Torso'],
      [DATE, 'Manufacturer Arms Furnace', 'Defender', 'Pilgrim', 'Torso'],
    ])
    expect(furnace).toHaveLength(2)
  })

  it('writes arms and boxes to T9Manu only', () => {
    const card = { ...newCard(), ...abnSupHelmet }
    expect(rowsFor(DATE, 'arms', [card])).toEqual({
      t9Manu: [[DATE, 'Manufacturer Arms', 'Supporter', 'Abnormal', 'Helmet']],
      furnace: [],
    })
    expect(rowsFor(DATE, 'box', [card]).t9Manu[0][1]).toBe('Manufacturer Selection Box')
  })
})
