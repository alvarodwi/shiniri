// WIB is UTC+7 with no DST, so shifting by 7h makes the UTC clock read WIB on any device.
export function wibTimestamp(now: Date = new Date()): string {
  return new Date(now.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ')
}
