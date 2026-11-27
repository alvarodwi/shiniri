// Sarcastic remarks per pain level; {who} is the Nikke and its core label, e.g. "Rapi C8".
// Add more lines to a level and one is picked at random.
export const OVERCORE_LINES: Record<1 | 2 | 3 | 4 | 5 | 6 | 7, readonly string[]> = {
  1: ['{who}, from a freebie. 6000 Body Labels, I guess.'],
  2: ["{who} again. Here's 6000 Body Labels for the trouble."],
  3: ['Your gem hoard, converted: {who}. 6000 Body Labels.'],
  4: ['You picked the manufacturer. The manufacturer picked {who}.'],
  5: ['A Perfect Mold, perfectly wasted on {who}.'],
  6: ['You bought {who}. With your own hands.'],
  7: ['Gold Mileage, spent on {who}. Nobody did this to you.'],
}

export const OVERSPEC_LINE = "And she's overspec."
