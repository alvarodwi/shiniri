import { createRouter, createWebHashHistory } from 'vue-router'

import Anomaly from '@/pages/Anomaly.vue'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/anomaly' },
    { path: '/anomaly', component: Anomaly },
  ],
})
