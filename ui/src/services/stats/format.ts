// How every stats answer writes its numbers and dates.
const MONTHS = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ')

// Both take an ISO day (see cellGameDay). Not Intl: en-GB writes "Sept".
export const formatMonth = (day: string) =>
  `${MONTHS[Number(day.slice(5, 7)) - 1]} ${day.slice(0, 4)}`
export const formatDate = (day: string) => `${Number(day.slice(8, 10))} ${formatMonth(day)}`

export const formatCount = (n: number) => n.toLocaleString('en-US')
export const formatPlural = (n: number, unit: string, plural = `${unit}s`) =>
  `${formatCount(n)} ${n === 1 ? unit : plural}`

const large = new Intl.NumberFormat('en-US', { notation: 'compact', maximumSignificantDigits: 3 })
export const formatLarge = (n: number) => large.format(n)

// The largest non-zero unit and the one below it, truncated.
export function formatDuration(ms: number): string {
  const min = Math.floor(ms / 60_000)
  const days = Math.floor(min / 1440)
  const parts = [
    [days, days === 1 ? 'day' : 'days'],
    [Math.floor(min / 60) % 24, 'h'],
    [min % 60, 'min'],
  ] as const
  const i = parts.findIndex(([n]) => n > 0)
  if (i < 0) return '0 min'
  return parts
    .slice(i, i + 2)
    .filter(([n]) => n > 0)
    .map(([n, unit]) => `${formatCount(n)} ${unit}`)
    .join(' ')
}

// No "%": the question carries it. A share of nothing is no answer.
export const formatPercent = (part: number, total: number) =>
  total === 0 ? null : String(Math.round((part / total) * 100))

// "13.3 (8 of 60)"; a share of nothing is no answer.
export const formatShareOf = (part: number, total: number) =>
  total ? `${formatShare(part, total)} (${formatCount(part)} of ${formatCount(total)})` : null

// A small share, to one decimal.
export const formatShare = (part: number, total: number) =>
  String(Math.round((part / total) * 1000) / 10)

export const formatSigned = (n: number) => `${n > 0 ? '+' : ''}${formatCount(n)}`

// "+1.2 (10 against 8.8 expected)". Expected comes times 100, to have stayed in whole numbers.
export function formatVsOdds(got: number, dueX100: number) {
  const diff = Math.round((got * 100 - dueX100) / 10) / 10
  const due = Math.round(dueX100 / 10) / 10
  return `${formatSigned(diff)} (${formatCount(got)} against ${formatCount(due)} expected)`
}

const usdDigits = { minimumFractionDigits: 2, maximumFractionDigits: 2 }
export const formatMoney = (idr: number, usd: number) =>
  `Rp${formatCount(Math.round(idr))} ($${usd.toLocaleString('en-US', usdDigits)})`
