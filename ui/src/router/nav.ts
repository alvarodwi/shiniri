export type NavGroup = {
  key: 'journal' | 'gacha' | 'log'
  label: string
  to: string
  links: { to: string; label: string }[]
}

export const NAV: NavGroup[] = [
  {
    key: 'journal',
    label: 'Journal',
    to: '/journal/anomaly',
    links: [
      { to: '/journal/anomaly', label: 'Anomaly' },
      { to: '/journal/gear', label: 'Gear' },
      { to: '/journal/level', label: 'Level' },
      { to: '/journal/solo-raid', label: 'Solo Raid' },
    ],
  },
  {
    key: 'gacha',
    label: 'Gacha',
    to: '/gacha/pulls',
    links: [
      { to: '/gacha/pulls', label: 'Pulls' },
      { to: '/gacha/spending', label: 'Spending' },
      { to: '/gacha/costumes', label: 'Costumes' },
    ],
  },
  { key: 'log', label: 'Log', to: '/log', links: [] },
]

export const groupOf = (path: string): NavGroup | null =>
  NAV.find((g) => path === g.to || path.startsWith(`/${g.key}/`)) ?? null
