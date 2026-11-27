import type { Nikke } from '@/services/nikke/nikkeDatabase'

// The SSRs a gacha source can give. Each page says whether overspec and Abnormal can come out of it.
export function ssrPool(nikkes: Nikke[], allow: { overspec: boolean; abnormal: boolean }): Nikke[] {
  return nikkes.filter((n) => {
    if (n.rarity !== 'SSR') return false
    if (n.overspec) return allow.overspec
    if (n.manufacturer.toLowerCase() === 'abnormal') return allow.abnormal
    return true
  })
}
