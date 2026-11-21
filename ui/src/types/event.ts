// Banner types, exactly as the owner writes them in the Event tab.
export const RATE_UP_TYPES = [
  'Pilgrim Limited',
  'Collaboration Limited',
  'Regular',
  'Winter Limited',
  'Summer Limited',
] as const

// The only banner type whose pool includes Abnormal Nikkes.
export const COLLAB_TYPE = 'Collaboration Limited'

// Form state, kept as typed; eventRows turns it into a sheet row.
export type EventEntry = {
  date: string
  rateUpName: string
  rateUpType: string
  gems: string
  tix: string
  names: string[]
  notes: string
}
