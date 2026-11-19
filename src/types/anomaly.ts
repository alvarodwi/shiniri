export const BOSSES = ['Kraken', 'Ultra', 'Mirror Container', 'Indivilia', 'Harvester'] as const
export type Boss = (typeof BOSSES)[number]

export type DropType = 'Modules' | 'Helmet' | 'Gloves' | 'Torso' | 'Boots'
export const DROP_TYPE: Record<Boss, DropType> = {
  Kraken: 'Modules',
  Ultra: 'Helmet',
  'Mirror Container': 'Gloves',
  Indivilia: 'Torso',
  Harvester: 'Boots',
}

export const CLASS_TYPES = ['Attacker', 'Defender', 'Supporter'] as const
export const MANUFACTURERS = ['Elysion', 'Missilis', 'Tetra', 'Pilgrim', 'Abnormal'] as const

export type Gear = {
  classType: (typeof CLASS_TYPES)[number]
  manufacturer: (typeof MANUFACTURERS)[number]
}

export type ModuleCount = 0 | 1 | 2 | 3

export type AnomalyRun = {
  boss: Boss
  stage: number // 1-9; 9 always drops the reward
  dropped: boolean
  modules: ModuleCount
  gear: Gear | null
  note: string
}

export type RunDefaults = Pick<AnomalyRun, 'boss' | 'stage'>
