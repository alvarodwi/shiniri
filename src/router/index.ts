import { createRouter, createWebHashHistory } from 'vue-router'

import Anomaly from '@/pages/Anomaly.vue'
import Gear from '@/pages/Gear.vue'
import Log from '@/pages/Log.vue'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/anomaly' },
    { path: '/anomaly', component: Anomaly },
    { path: '/gear', component: Gear },
    { path: '/log', component: Log },
  ],
})
