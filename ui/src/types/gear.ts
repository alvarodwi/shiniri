export const CLASS_TYPES = ['Attacker', 'Defender', 'Supporter'] as const
export const MANUFACTURERS = ['Elysion', 'Missilis', 'Tetra', 'Pilgrim', 'Abnormal'] as const
export const SLOTS = ['Helmet', 'Torso', 'Gloves', 'Boots'] as const

export type ClassType = (typeof CLASS_TYPES)[number]
export type Manufacturer = (typeof MANUFACTURERS)[number]
export type Slot = (typeof SLOTS)[number]

export type Gear = { classType: ClassType; manufacturer: Manufacturer }

// Gear `source` values, verbatim: the stats tabs group by these strings.
export const SPECIAL_SOURCE = 'Special Interception' // closed history, so no form writes it
export const ANOMALY_SOURCE = 'Anomaly Interception'
export const GEAR_SOURCES = {
  arms: 'Manufacturer Arms',
  box: 'Manufacturer Selection Box',
  furnace: 'Manufacturer Arms Furnace',
} as const
export type GearSource = keyof typeof GEAR_SOURCES

export type GearItem = {
  manufacturer: Manufacturer | null
  classType: ClassType | null
  slot: Slot | null
}

// One item from an opening. For Furnace, the item fields are the result and the rest is the attempt.
export type GearCard = GearItem & {
  target: Manufacturer | null
  sacrifices: [GearItem, GearItem]
}
