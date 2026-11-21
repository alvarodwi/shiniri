// The sources the form offers. Liberation and Bonus Recruit rows exist in the sheet as history only.
export const SPARE_SOURCES = ['Gold Mileage', 'Silver Mileage', 'Union Chip'] as const

export type SpareSource = (typeof SPARE_SOURCES)[number]

// The liberation units a union chip can buy, by exact name (never a prefix).
export const LIBERATION_UNITS = ['Sin', 'Quency', 'Guilty', 'Nihilister'] as const

// Form state, kept as typed; spareBodyRows turns it into sheet rows.
export type SpareBodyEntry = {
  date: string
  source: string
  target: string
  copies: string
  notes: string
}
