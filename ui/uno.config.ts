import { defineConfig, presetAttributify, presetIcons, presetWind3 } from 'unocss'

// The merchant's counter: account-book paper (cream) and lacquer ink (charcoal) swap in dark mode,
// while the shell stays lacquer, with brass gold rules and a vermilion seal. Colours that must change
// per theme (gold, error) are CSS variables from src/styles/shop.css.
export default defineConfig({
  content: { pipeline: { include: [/\.(vue|[jt]sx?)($|\?)/] } },
  presets: [
    presetWind3({ dark: 'class' }),
    presetAttributify(),
    presetIcons({ scale: 1.1, warn: true }),
  ],
  theme: {
    colors: {
      cream: '#f6eedd',
      charcoal: '#241719',
      lacquer: '#170d0f',
      seal: '#c23a24',
      gold: 'var(--gold)',
      accent: { DEFAULT: '#d48275', ink: 'var(--err)' },
    },
    fontFamily: { shop: '"Zen Antique", "Noto Serif JP", serif' },
  },
  shortcuts: {
    paper: 'bg-cream dark:bg-charcoal',
    ink: 'text-charcoal dark:text-cream',
    'ink-soft': 'text-charcoal/75 dark:text-cream/75',
    rule: 'border-charcoal/20 dark:border-cream/20',
    'rule-ink': 'border-charcoal/70 dark:border-cream/70',
    focus:
      'outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-seal dark:focus-visible:outline-gold',
    // An outlined 44px text button (Stats).
    'btn-line': 'focus press rule-ink min-h-11 border px-3 text-sm',
    press:
      'transition-transform duration-150 ease-out active:translate-y-px motion-reduce:transition-none',
    // A selected tap or toggle: the seal colour.
    'tap-on': 'bg-seal text-cream border-seal',
    // The vermilion seal that every Save and sign-in uses.
    'btn-save':
      'focus mx-auto block min-h-12 w-full max-w-xl rounded-md border-2 border-b-5 border-[#8e2514] bg-seal font-semibold tracking-wide text-[#fff6e6] transition-transform duration-150 active:translate-y-[3px] active:border-b-2 disabled:opacity-45 motion-reduce:transition-none',
    'page-title': 'font-shop text-2xl font-normal tracking-wide border-b-2 border-gold pb-1',
    savebar: 'paper fixed inset-x-0 bottom-0 border-t-2 border-gold px-4 py-3',
  },
})
