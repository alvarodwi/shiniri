export type NavGroup = {
  key: 'journal' | 'gacha' | 'log'
  label: string
  to: string
  icon: string
  links: { to: string; label: string; icon: string }[]
}

export const NAV: NavGroup[] = [
  {
    key: 'journal',
    label: 'Journal',
    icon: 'i-ph-notebook-duotone',
    to: '/journal/anomaly',
    links: [
      { to: '/journal/anomaly', label: 'Anomaly', icon: 'i-ph-warning-diamond-duotone' },
      { to: '/journal/gear', label: 'Gear', icon: 'i-ph-sword-duotone' },
      { to: '/journal/level', label: 'Level', icon: 'i-ph-chart-line-up-duotone' },
      { to: '/journal/solo-raid', label: 'Solo Raid', icon: 'i-ph-crosshair-duotone' },
    ],
  },
  {
    key: 'gacha',
    label: 'Gacha',
    icon: 'i-ph-sparkle-duotone',
    to: '/gacha/pulls',
    links: [
      { to: '/gacha/pulls', label: 'Pulls', icon: 'i-ph-ticket-duotone' },
      { to: '/gacha/spending', label: 'Spending', icon: 'i-ph-coins-duotone' },
      { to: '/gacha/costumes', label: 'Costumes', icon: 'i-ph-t-shirt-duotone' },
    ],
  },
  { key: 'log', label: 'Log', icon: 'i-ph-scroll-duotone', to: '/log', links: [] },
]

export const groupOf = (path: string): NavGroup | null =>
  NAV.find((g) => path === g.to || path.startsWith(`/${g.key}/`)) ?? null
