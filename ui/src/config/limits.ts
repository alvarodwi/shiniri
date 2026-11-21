// Every limit the forms enforce, so a game change is a one-line commit here.

// Anomaly Interception attempts per game day; a double day doubles them. Save always logs the full limit.
export const ANOMALY_RUNS = { normal: 5, double: 10 }

// Gear items in one save. Bigger hauls go in as several saves.
export const GEAR_MAX_ITEMS = 10

// LevelLogs logs every 5th synchro level, and one save covers at most 20 levels (the game's
// milestones are 20 apart, so a bigger jump is a typo).
export const LEVEL_STEP = 5
export const LEVEL_MAX_JUMP = 20

// Solo Raid ranks below this placement show as a top-% on the in-game leaderboard.
export const SOLO_RAID_MAX_PLACE = 100
