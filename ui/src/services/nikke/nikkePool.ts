import type { Nikke } from '@/services/nikke/nikkeDatabase'

// The SSRs a gacha source can give. Each page says whether Pilgrim and Abnormal can come out of it.
export function ssrPool(nikkes: Nikke[], allow: { pilgrim: boolean; abnormal: boolean }): Nikke[] {
  return nikkes.filter((n) => {
    const maker = n.manufacturer.toLowerCase()
    if (n.rarity !== 'SSR') return false
    if (maker === 'pilgrim') return allow.pilgrim
    if (maker === 'abnormal') return allow.abnormal
    return true
  })
}
