// NIKKE resets daily at 20:00 UTC (03:00 WIB), so shifting by +4h makes the UTC date the game day.
export function gameDay(now: Date = new Date()): string {
  return new Date(now.getTime() + 4 * 60 * 60 * 1000).toISOString().slice(0, 10)
}
