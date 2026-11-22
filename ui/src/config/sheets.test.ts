import { describe, expect, it } from 'vitest'
import {
  ALL_PULLS_TAB,
  ANOMALY_TAB,
  EVENT_TAB,
  EXCHANGE_TAB,
  EXTRA_TAB,
  FURNACE_TAB,
  GEAR_TAB,
  LEVEL_TAB,
  MOLD_TAB,
  NIKKE_DATABASE_TAB,
  ORDINARY_TAB,
  OVERCORE_TAB,
  ROSTER_LOG_TAB,
  SOCIAL_TAB,
  SOLO_RAID_TAB,
  SPENDING_TAB,
  SPREADSHEETS,
  type TabSpec,
} from './sheets'

// The sheet contract: these strings must match the sheet verbatim.
const shape = (t: TabSpec) => ({ tab: t.tab, headers: t.headers })

describe('tab specs', () => {
  it('Anomaly', () => {
    expect(shape(ANOMALY_TAB)).toEqual({
      tab: 'Anomaly',
      headers: [
        'date',
        'boss',
        'stage',
        'dropped',
        'modules',
        'class',
        'manufacturer',
        'dropType',
        '',
      ],
    })
  })
  it('Gear', () => {
    expect(shape(GEAR_TAB)).toEqual({
      tab: 'Gear',
      headers: ['date', 'source', 'class', 'manufacturer', 'slot'],
    })
  })
  it('Furnace', () => {
    expect(shape(FURNACE_TAB)).toEqual({
      tab: 'Furnace',
      headers: ['date', 'target', 'sacrifice1', 'sacrifice2', 'result'],
    })
  })
  it('LevelLog', () => {
    expect(shape(LEVEL_TAB)).toEqual({
      tab: 'LevelLog',
      headers: ['synchroLevel', 'date', 'daysElapsed', 'notes'],
    })
  })
  it('SoloRaid', () => {
    expect(shape(SOLO_RAID_TAB)).toEqual({
      tab: 'SoloRaid',
      headers: ['season', 'month', 'boss', 'weakness', 'damage', 'rank', 'notes'],
    })
  })
  it('Social', () => {
    expect(shape(SOCIAL_TAB)).toEqual({
      tab: 'Social',
      headers: ['date', 'pulls', 'totalSsr', 'ssrDetails', 'notes'],
    })
  })
  it('Event', () => {
    expect(shape(EVENT_TAB)).toEqual({
      tab: 'Event',
      headers: [
        'date',
        'rateUpName',
        'rateUpType',
        'gems',
        'tickets',
        'pulls',
        'totalSsr',
        'ssrDetails',
        'notes',
      ],
    })
  })
  it('Ordinary', () => {
    expect(shape(ORDINARY_TAB)).toEqual({
      tab: 'Ordinary',
      headers: ['date', 'gems', 'tickets', 'pulls', 'totalSsr', 'ssrDetails', 'notes'],
    })
  })
  it('Mold', () => {
    expect(shape(MOLD_TAB)).toEqual({
      tab: 'Mold',
      headers: ['date', 'moldType', 'pulls', 'totalSsr', 'ssrDetails', 'notes'],
    })
  })
  it('Exchange', () => {
    expect(shape(EXCHANGE_TAB)).toEqual({
      tab: 'Exchange',
      headers: ['date', 'nikke', 'source', 'notes'],
    })
  })
  it('Extra', () => {
    expect(shape(EXTRA_TAB)).toEqual({
      tab: 'Extra',
      headers: [
        'date',
        'source',
        'sourceDetail',
        'rateUpName',
        'gems',
        'pulls',
        'totalSsr',
        'ssrDetails',
        'notes',
      ],
    })
  })
  it('NikkeDatabase', () => {
    expect(shape(NIKKE_DATABASE_TAB)).toEqual({
      tab: 'NikkeDatabase',
      headers: [
        'nameCode',
        'nikke',
        'rarity',
        'manufacturer',
        'class',
        'burst',
        'element',
        'weapon',
        'resourceId',
        'releaseDate',
      ],
    })
  })
  it('Spending', () => {
    expect(shape(SPENDING_TAB)).toEqual({
      tab: 'Spending',
      headers: ['date', 'packageName', 'type', 'priceIdr', 'priceUsd', 'platform', 'notes'],
    })
  })
  it('AllPulls', () => {
    expect(shape(ALL_PULLS_TAB)).toEqual({
      tab: 'AllPulls',
      headers: ['date', 'nikke', 'source', 'spook', 'copy', 'isOvercore'],
    })
  })
  it('RosterLog', () => {
    expect(shape(ROSTER_LOG_TAB)).toEqual({
      tab: 'RosterLog',
      headers: ['date', 'nameCode', 'nikke', 'copies'],
    })
  })
  it('Overcore', () => {
    expect(shape(OVERCORE_TAB)).toEqual({
      tab: 'Overcore',
      headers: ['date', 'source', 'nikke', 'manufacturer', 'notes'],
    })
  })
  it('AuditLog on both spreadsheets', () => {
    for (const s of SPREADSHEETS) {
      expect(shape(s.audit)).toEqual({
        tab: 'AuditLog',
        headers: ['savedAt', 'form', 'ranges', 'rows'],
      })
    }
  })
})
