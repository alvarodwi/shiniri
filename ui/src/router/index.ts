import { createRouter, createWebHashHistory } from 'vue-router'

import { REDIRECTS } from './redirects'

import Anomaly from '@/pages/Anomaly.vue'
import Costumes from '@/pages/Costumes.vue'
import Gear from '@/pages/Gear.vue'
import Level from '@/pages/Level.vue'
import Log from '@/pages/Log.vue'
import Pulls from '@/pages/Pulls.vue'
import SoloRaid from '@/pages/SoloRaid.vue'
import SpendingPage from '@/pages/Spending.vue'
import Stats from '@/pages/Stats.vue'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    ...Object.entries(REDIRECTS).map(([path, redirect]) => ({ path, redirect })),
    { path: '/journal/anomaly', component: Anomaly },
    { path: '/journal/gear', component: Gear },
    { path: '/journal/level', component: Level },
    { path: '/journal/solo-raid', component: SoloRaid },
    { path: '/gacha/pulls', component: Pulls },
    { path: '/gacha/spending', component: SpendingPage },
    { path: '/gacha/costumes', component: Costumes },
    { path: '/stats', component: Stats },
    { path: '/log', component: Log },
  ],
})
