import { GEAR_SOURCES } from '@/types/gear'
import type { GearCard, GearItem, GearSource } from '@/types/gear'
import type { Cell } from '@/types/sheet'

const blankItem = (): GearItem => ({ manufacturer: null, classType: null, slot: null })

export const newCard = (): GearCard => ({
  ...blankItem(),
  target: null,
  sacrifices: [blankItem(), blankItem()],
})

const isItemComplete = (i: GearItem) => !!i.manufacturer && !!i.classType && !!i.slot

export function isCardComplete(card: GearCard, source: GearSource): boolean {
  if (!isItemComplete(card)) return false
  if (source !== 'furnace') return true
  return card.manufacturer === card.target && card.sacrifices.every(isItemComplete)
}

// Class, manufacturer, slot, in the order both gear tabs use. Expects a complete item.
const gearCells = (i: GearItem): Cell[] => [i.classType!, i.manufacturer!, i.slot!]

// Columns A-E of Gear. Expects a complete item.
export const t9ManuRow = (date: string, sourceType: string, item: GearItem): Cell[] => [
  date,
  sourceType,
  ...gearCells(item),
]

// Columns A-J of Furnace.
export const furnaceRow = (date: string, card: GearCard): Cell[] => [
  date,
  card.target!,
  ...gearCells(card.sacrifices[0]),
  ...gearCells(card.sacrifices[1]),
  card.classType!,
  card.slot!,
]

// Expects complete cards (see isCardComplete).
export function rowsFor(date: string, source: GearSource, cards: GearCard[]) {
  return {
    t9Manu: cards.map((c) => t9ManuRow(date, GEAR_SOURCES[source], c)),
    furnace: source === 'furnace' ? cards.map((c) => furnaceRow(date, c)) : [],
  }
}
