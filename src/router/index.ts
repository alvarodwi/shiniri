import { createRouter, createWebHashHistory } from 'vue-router'

import Anomaly from '@/pages/Anomaly.vue'
import Gear from '@/pages/Gear.vue'
import Log from '@/pages/Log.vue'
import Special from '@/pages/Special.vue'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/anomaly' },
    { path: '/anomaly', component: Anomaly },
    { path: '/gear', component: Gear },
    { path: '/special', component: Special },
    { path: '/log', component: Log },
  ],
})
