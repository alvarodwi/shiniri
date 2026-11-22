import { describe, expect, it } from 'vitest'

import { lastLevel, levelSteps, toRows } from './levelRows'

describe('lastLevel', () => {
  it('reads the last level and its sheet row, skipping trailing blanks', () => {
    expect(lastLevel(['synchroLevel', '200', '205', '210', '', ' '])).toEqual({
      level: 210,
      row: 4,
    })
  })

  it('refuses a last row that is not a number, since the next save lands below it', () => {
    expect(() => lastLevel(['synchroLevel', '210', '#REF!'])).toThrow(
      "LevelLog row 3 isn't a level: #REF!",
    )
  })

  it('is null for a header-only tab', () => {
    expect(lastLevel(['synchroLevel'])).toBeNull()
  })
})

describe('levelSteps', () => {
  it('lists every multiple of 5 above the last level up to the target', () => {
    expect(levelSteps(210, 225)).toEqual([215, 220, 225])
    expect(levelSteps(210, 215)).toEqual([215])
  })

  it('starts at the next multiple of 5 after an off-step last level', () => {
    expect(levelSteps(213, 225)).toEqual([215, 220, 225])
  })

  it('writes only the target when nothing is logged yet', () => {
    expect(levelSteps(null, 230)).toEqual([230])
  })

  it('refuses targets that are not above the last level or not multiples of 5', () => {
    expect(levelSteps(210, 210)).toEqual([])
    expect(levelSteps(210, 200)).toEqual([])
    expect(levelSteps(210, 222)).toEqual([])
    expect(levelSteps(210, 0)).toEqual([])
    expect(levelSteps(null, 0)).toEqual([])
    expect(levelSteps(null, 222)).toEqual([])
    expect(levelSteps(210, 217.5)).toEqual([])
  })

  it('refuses jumps over 20 levels without building them', () => {
    expect(levelSteps(780, 800)).toEqual([785, 790, 795, 800])
    expect(levelSteps(780, 805)).toEqual([])
    expect(levelSteps(210, 710)).toEqual([])
    expect(levelSteps(210, 225_000_000)).toEqual([])
  })
})

describe('toRows', () => {
  it('writes one row per step with the note on the last row only', () => {
    const rows = toRows([215, 220], '2026-11-19', ' hi ')
    expect(rows.map((r) => [r[0], r[1], r[3]])).toEqual([
      [215, '2026-11-19', ''],
      [220, '2026-11-19', "'hi"],
    ])
  })

  it('gives each row a guarded daysElapsed formula for its own sheet row', () => {
    const [[, , days]] = toRows([215], '2026-11-19', '')
    expect(typeof days === 'function' && days(231)).toBe('=IF(B232="","",B232-B231)')
  })

  it('leaves the note empty when none is given', () => {
    expect(toRows([215], '2026-11-19', '  ')[0][3]).toBe('')
  })
})
