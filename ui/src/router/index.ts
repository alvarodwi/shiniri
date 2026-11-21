import { createRouter, createWebHashHistory } from 'vue-router'

import Anomaly from '@/pages/Anomaly.vue'
import EventPage from '@/pages/Event.vue'
import Gear from '@/pages/Gear.vue'
import Level from '@/pages/Level.vue'
import Log from '@/pages/Log.vue'
import MoldsPage from '@/pages/Molds.vue'
import OrdinaryPage from '@/pages/Ordinary.vue'
import Social from '@/pages/Social.vue'
import SoloRaid from '@/pages/SoloRaid.vue'
import Special from '@/pages/Special.vue'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/anomaly' },
    { path: '/anomaly', component: Anomaly },
    { path: '/event', component: EventPage },
    { path: '/ordinary', component: OrdinaryPage },
    { path: '/molds', component: MoldsPage },
    { path: '/gear', component: Gear },
    { path: '/level', component: Level },
    { path: '/social', component: Social },
    { path: '/solo-raid', component: SoloRaid },
    { path: '/special', component: Special },
    { path: '/log', component: Log },
  ],
})
