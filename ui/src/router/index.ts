import { createRouter, createWebHashHistory } from 'vue-router'

import Anomaly from '@/pages/Anomaly.vue'
import EventPage from '@/pages/Event.vue'
import Gear from '@/pages/Gear.vue'
import Level from '@/pages/Level.vue'
import Log from '@/pages/Log.vue'
import MoldsPage from '@/pages/Molds.vue'
import OrdinaryPage from '@/pages/Ordinary.vue'
import OtherPage from '@/pages/Other.vue'
import Social from '@/pages/Social.vue'
import SoloRaid from '@/pages/SoloRaid.vue'
import SpareBodyPage from '@/pages/SpareBody.vue'
import Special from '@/pages/Special.vue'
import SpendingPage from '@/pages/Spending.vue'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/anomaly' },
    { path: '/anomaly', component: Anomaly },
    { path: '/event', component: EventPage },
    { path: '/ordinary', component: OrdinaryPage },
    { path: '/mold', component: MoldsPage },
    { path: '/exchange', component: SpareBodyPage },
    { path: '/extra', component: OtherPage },
    { path: '/spending', component: SpendingPage },
    { path: '/gear', component: Gear },
    { path: '/level', component: Level },
    { path: '/social', component: Social },
    { path: '/solo-raid', component: SoloRaid },
    { path: '/special', component: Special },
    { path: '/log', component: Log },
  ],
})
