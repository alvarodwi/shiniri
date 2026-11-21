export const OTHER_TYPES = ['Welfare Unit', 'Welfare Pass', 'Free Pulls', 'Guaranteed SSR'] as const

export type OtherType = (typeof OTHER_TYPES)[number]

export const GUARANTEED = 'Guaranteed SSR'
export const FREE_PULLS = 'Free Pulls'

// Form state, kept as typed; otherRows turns it into sheet rows.
export type OtherEntry = {
  date: string
  sourceType: string
  sourceInfo: string
  rateUpName: string
  gems: string
  times: string
  copies: string
  names: string[]
  notes: string
}
