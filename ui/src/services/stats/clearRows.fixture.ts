import { FACTS } from './facts'

// Hand-made Campaign and Tower rows for the fact tests.
export const A = ['Liter', 'Crown', 'Rapi', 'Anis', 'Neon']
export const B = ['Liter', 'Crown', 'Rapi', 'Anis', 'Alice']

export type Row = Record<string, unknown>
export const row = (
  mode: string,
  place: number,
  stageName: string,
  date: string,
  team: string[] = B,
  recommendedCp = 1000,
  teamCp = 1000,
  synchroLevel = '5',
): Row => ({
  mode,
  chapter: place,
  floor: place,
  stageName,
  date,
  recommendedCp,
  teamCp,
  synchroLevel,
  ...Object.fromEntries(team.map((n, i) => [`slot${i + 1}`, n])),
})
export const floor = (
  mode: string,
  n: number,
  date: string,
  ...rest: [string[]?, number?, number?, string?]
) => row(mode, n, `${n}F`, date, ...rest)

// Normal chapter 2 is jumped (no 2-2); Normal 3 is not.
export const CAMPAIGN = [
  row('Normal', 2, '2-1 STAGE', '2025-01-01 10:00:00', A, 1000, 900),
  row('Normal', 2, '2-3 BOSS', '2025-01-01 10:20:00', A, 2000, 1500),
  row('Normal', 2, 'SUB 2-1 STAGE', '2025-01-01 11:30:00', B, 500, 1500),
  row('Normal', 2, 'EX STAGE', '2025-01-03 10:20:00', B, 0, 1600),
  row('Hard', 2, '2-1 HARD STAGE', '2025-02-01 10:00:00', B, 3000, 6000, '5, 1, 5'),
  row('Hard', 2, '2-2 HARD STAGE', '2025-02-01 10:05:00', B, 4000, 6000),
  row('Hard', 2, 'EX HARD STAGE', '2025-02-01 10:06:00', B, 0, 6000),
  row('Hard', 2, '2-3 HARD BOSS', '2025-02-02 10:05:00', A, 8000, 6000),
  row('Normal', 3, '3-1 STAGE', '2025-03-01 10:00:00', B, 1000, 1000, '1'),
  row('Normal', 3, '3-2 BOSS', '2025-03-04 12:00:00', B),
  row('Normal', 3, 'EX STAGE', '2025-03-05 12:00:00', B, 0, 1000),
]

export const TOWER = [
  floor('Tribe', 10, '2025-01-01 10:00:00', A, 1000, 800, '1'),
  floor('Tribe', 25, '2025-01-01 10:10:00', A, 1000, 3000),
  floor('Tetra', 20, '2025-01-05 12:00:00', B, 500, 400),
  floor('Tetra', 25, '2025-01-05 12:05:00', B, 500, 900),
  floor('Tribe', 50, '2025-01-11 12:10:00', B, 2000, 1000),
]

// Runs a fact over only the columns it declares.
export function compute(
  id: string,
  values: Record<string, string>,
  rows: { Campaign?: Row[]; Tower?: Row[] },
  today = '2026-11-28',
) {
  const fact = FACTS.find((f) => f.id === id)!
  const cols = Object.fromEntries(
    fact.reads.map(({ tab, columns }) => [
      tab.tab,
      Object.fromEntries(
        columns.map((c) => [c, rows[tab.tab as 'Campaign']!.map((r) => r[c] ?? '')]),
      ),
    ]),
  )
  return fact.compute(cols, values, today)
}
