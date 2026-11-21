export type Currency = { gems: string; tix: string }

// A blank currency counts as 0, so filling just gems or just tix is enough; both blank gives 0 pulls.
const amount = (s: string): number | null =>
  s.trim() === '' ? 0 : /^\d+$/.test(s.trim()) ? Number(s) : null

// The line under the currency inputs: the pull count, or why the entry can't be saved yet.
export function pullsHint(c: Currency): string {
  if (!c.gems.trim() && !c.tix.trim()) return '300 gems = 1 voucher = 1 pull'
  const gems = amount(c.gems)
  const tix = amount(c.tix)
  if (gems === null || tix === null) return 'Gems and tix are whole numbers'
  if (gems % 300 !== 0) return 'Gems come in multiples of 300'
  const times = tix + gems / 300
  return times < 1 ? 'Under 1 pull' : `${times} pulls`
}

// The amounts and the pull count (what the sheet's own formula gives: 300 gems = 1 voucher = 1 pull),
// or null while an amount is invalid, gems isn't a whole number of vouchers, or it's under 1 pull.
export function pulls(c: Currency): { gems: number; tix: number; times: number } | null {
  const gems = amount(c.gems)
  const tix = amount(c.tix)
  if (gems === null || tix === null || gems % 300 !== 0) return null
  const times = tix + gems / 300
  return times < 1 ? null : { gems, tix, times }
}
