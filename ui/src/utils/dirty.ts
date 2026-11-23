// The date defaults to the game day at store creation, so it alone never counts as unsaved input.
export function isEntryDirty(entry: object, fresh: object): boolean {
  return JSON.stringify({ ...entry, date: '' }) !== JSON.stringify({ ...fresh, date: '' })
}
