import { describe, expect, it } from 'vitest'

import {
  applyToRun,
  countRowsForDate,
  isRunComplete,
  lastRunDefaults,
  newRun,
  toRow,
} from './anomalyRows'

import type { AnomalyRun } from '@/types/anomaly'

const kraken: AnomalyRun = {
  boss: 'Kraken',
  stage: 9,
  dropped: true,
  modules: 2,
  gear: null,
  note: '',
}
const ultraFail: AnomalyRun = {
  boss: 'Ultra',
  stage: 7,
  dropped: false,
  modules: 0,
  gear: { classType: 'Attacker', manufacturer: 'Tetra' },
  note: '',
}
const indi: AnomalyRun = {
  boss: 'Indivilia',
  stage: 9,
  dropped: false,
  modules: 1,
  gear: { classType: 'Supporter', manufacturer: 'Pilgrim' },
  note: '',
}

describe('toRow', () => {
  it('maps a kraken run to columns A-I', () => {
    expect(toRow('2026-11-17', kraken)).toEqual([
      '2026-11-17',
      'Kraken',
      9,
      true,
      2,
      '',
      '',
      'Modules',
      '',
    ])
  })

  it('trims the note into column I', () => {
    expect(toRow('d', { ...kraken, note: '  double drop day  ' })[8]).toBe('double drop day')
  })

  it('drops stale gear on a failed run', () => {
    expect(toRow('2026-11-17', ultraFail)).toEqual([
      '2026-11-17',
      'Ultra',
      7,
      false,
      0,
      '',
      '',
      'Helmet',
      '',
    ])
  })

  it('forces dropped at stage 9 and writes gear', () => {
    expect(toRow('2026-11-17', indi)).toEqual([
      '2026-11-17',
      'Indivilia',
      9,
      true,
      1,
      'Supporter',
      'Pilgrim',
      'Torso',
      '',
    ])
  })

  it('never writes gear for kraken', () => {
    const row = toRow('d', { ...kraken, gear: { classType: 'Defender', manufacturer: 'Elysion' } })
    expect(row[5]).toBe('')
    expect(row[6]).toBe('')
  })
})

describe('isRunComplete', () => {
  it('needs gear when the box dropped', () => {
    expect(isRunComplete({ ...indi, gear: null })).toBe(false)
    expect(isRunComplete({ ...ultraFail, gear: null })).toBe(true)
  })
})

describe('lastRunDefaults', () => {
  it('reads boss and stage from the last row', () => {
    expect(
      lastRunDefaults(['2026-11-16', 'Mirror Container', '8', 'TRUE', '1', '', '', 'Gloves']),
    ).toEqual({ boss: 'Mirror Container', stage: 8 })
  })

  it('falls back to kraken 9', () => {
    expect(lastRunDefaults(undefined)).toEqual({ boss: 'Kraken', stage: 9 })
    expect(lastRunDefaults(['x', 'Unknown', 'abc'])).toEqual({ boss: 'Kraken', stage: 9 })
    expect(lastRunDefaults(['x', 'Ultra', '12'])).toEqual({ boss: 'Kraken', stage: 9 })
  })
})

describe('applyToRun', () => {
  it('carries a change forward to untouched later runs only', () => {
    const runs = Array.from({ length: 5 }, () => newRun({ boss: 'Kraken', stage: 9 }))
    const out = applyToRun(runs, [false, true, false, false, false], 0, { boss: 'Ultra' })
    expect(out.map((r) => r.boss)).toEqual(['Ultra', 'Kraken', 'Ultra', 'Ultra', 'Ultra'])
    expect(runs[0].boss).toBe('Kraken')
  })

  it('does not touch earlier runs', () => {
    const runs = Array.from({ length: 3 }, () => newRun({ boss: 'Kraken', stage: 9 }))
    const out = applyToRun(runs, [false, false, false], 1, { stage: 6 })
    expect(out.map((r) => r.stage)).toEqual([9, 6, 6])
  })
})

describe('countRowsForDate', () => {
  it('counts matching dates anywhere in column A', () => {
    expect(
      countRowsForDate(['date', '2026-11-17', '', '2026-11-17', '2026-11-16'], '2026-11-17'),
    ).toBe(2)
  })

  it('matches date serials from unformatted reads', () => {
    expect(countRowsForDate(['date', '46343', '46342', '2026-11-17'], '2026-11-17')).toBe(2)
  })
})

describe('newRun', () => {
  it('starts with 0 modules and nothing else but boss and stage', () => {
    expect(newRun({ boss: 'Harvester', stage: 4 })).toEqual({
      boss: 'Harvester',
      stage: 4,
      dropped: true,
      modules: 0,
      gear: null,
      note: '',
    })
  })
})
