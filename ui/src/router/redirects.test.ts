import { describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import { REDIRECTS } from './redirects'

const stub = { render: () => null }
const targets = [
  '/journal/anomaly',
  '/journal/gear',
  '/journal/level',
  '/journal/solo-raid',
  '/gacha/pulls',
  '/gacha/spending',
  '/gacha/costumes',
]
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    ...Object.entries(REDIRECTS).map(([path, redirect]) => ({ path, redirect })),
    ...targets.map((path) => ({ path, component: stub })),
  ],
})
const land = async (from: string) => {
  await router.push(from)
  return router.currentRoute.value.fullPath
}

describe('REDIRECTS', () => {
  it('sends the root to Anomaly', async () => {
    expect(await land('/')).toBe('/journal/anomaly')
  })
  it('moves the old flat paths', async () => {
    expect(await land('/anomaly')).toBe('/journal/anomaly')
    expect(await land('/gear')).toBe('/journal/gear')
    expect(await land('/level')).toBe('/journal/level')
    expect(await land('/solo-raid')).toBe('/journal/solo-raid')
    expect(await land('/spending')).toBe('/gacha/spending')
    expect(await land('/costumes')).toBe('/gacha/costumes')
  })
  it('sends every old form path to Pulls with its own form', async () => {
    for (const p of ['social', 'event', 'ordinary', 'mold', 'exchange', 'extra'])
      expect(await land(`/${p}`)).toBe(`/gacha/pulls?form=${p}`)
  })
  it('sends the removed Special page to Anomaly', async () => {
    expect(await land('/special')).toBe('/journal/anomaly')
  })
})
