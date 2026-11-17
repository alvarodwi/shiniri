import { defineConfig, presetAttributify, presetIcons, presetWind3 } from 'unocss'

export default defineConfig({
  dark: 'media',
  presets: [presetWind3(), presetAttributify(), presetIcons({ scale: 1.1, warn: true })],
  theme: {
    colors: {
      cream: '#fdfcf9',
      charcoal: '#27262a',
      accent: { DEFAULT: '#d48275', ink: '#c14e3c' },
    },
  },
  shortcuts: {
    paper: 'bg-cream dark:bg-charcoal',
    ink: 'text-charcoal dark:text-cream',
    'ink-soft': 'text-charcoal/75 dark:text-cream/75',
    rule: 'border-charcoal/20 dark:border-cream/20',
    'rule-ink': 'border-charcoal dark:border-cream',
    focus:
      'outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-charcoal dark:focus-visible:outline-cream',
    press:
      'transition-transform duration-150 ease-out active:translate-y-px motion-reduce:transition-none',
  },
})
