import type { Nikke } from '@/services/nikke/nikkeDatabase'

export const isAbnormal = (n: Nikke): boolean => n.manufacturer.toLowerCase() === 'abnormal'

// The SSRs a gacha source can give. Each page says whether overspec and limited ones can come out.
export function ssrPool(nikkes: Nikke[], allow: { overspec: boolean; limited: boolean }): Nikke[] {
  return nikkes.filter(
    (n) => n.rarity === 'SSR' && (allow.overspec || !n.overspec) && (allow.limited || !n.limited),
  )
}
