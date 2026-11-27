// How every stats answer writes its numbers and dates.
const MONTHS = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ')

// Both take an ISO day (see cellGameDay). Not Intl: en-GB writes "Sept".
export const formatMonth = (day: string) =>
  `${MONTHS[Number(day.slice(5, 7)) - 1]} ${day.slice(0, 4)}`
export const formatDate = (day: string) => `${Number(day.slice(8, 10))} ${formatMonth(day)}`

export const formatCount = (n: number) => n.toLocaleString('en-US')
export const formatPlural = (n: number, unit: string) =>
  `${formatCount(n)} ${unit}${n === 1 ? '' : 's'}`

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

export const formatSigned = (n: number) => `${n > 0 ? '+' : ''}${formatCount(n)}`

const usdDigits = { minimumFractionDigits: 2, maximumFractionDigits: 2 }
export const formatMoney = (idr: number, usd: number) =>
  `Rp${formatCount(Math.round(idr))} ($${usd.toLocaleString('en-US', usdDigits)})`
