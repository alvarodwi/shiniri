export const WEAKNESSES = ['Fire', 'Water', 'Wind', 'Electric', 'Iron'] as const
export type Weakness = (typeof WEAKNESSES)[number]

// percent: top-% like 7.95%; place: a leaderboard placement like #12 (see SOLO_RAID_MAX_PLACE)
export type RankMode = 'percent' | 'place'

// Form state, kept as typed; soloRaidRows turns it into a sheet row.
export type RaidEntry = {
  season: number | null
  date: string
  boss: string
  weakness: Weakness | null
  damage: string
  rankMode: RankMode
  rank: string
  comments: string
}
