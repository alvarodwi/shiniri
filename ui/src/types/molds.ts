export const MOLD_TYPES = [
  'Pilgrim Mold',
  'Yellow Mold',
  'Purple Mold',
  'Missilis Mold',
  'Elysion Mold',
  'Tetra Mold',
  'Pilgrim Perfect Mold',
  'Elysion Perfect Mold',
  'Missilis Perfect Mold',
  'Tetra Perfect Mold',
  'HQ Mold',
  'HQ Perfect Mold',
] as const

export type MoldType = (typeof MOLD_TYPES)[number]

// Form state, kept as typed; moldRows turns it into a sheet row.
export type MoldsEntry = {
  date: string
  moldType: MoldType | ''
  amount: string
  names: string[]
  notes: string
}
