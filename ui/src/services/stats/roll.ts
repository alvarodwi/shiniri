// One random value per filter, drawn from its real options. A filter with no options is left
// unchosen.
export const rollValues = (
  options: Record<string, string[]>,
  random: () => number,
): Record<string, string> =>
  Object.fromEntries(
    Object.entries(options)
      .filter(([, o]) => o.length)
      .map(([id, o]) => [id, o[Math.floor(random() * o.length)]]),
  )
