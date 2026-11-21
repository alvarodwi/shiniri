import { createPinia } from 'pinia'
import { createApp } from 'vue'

import App from './App.vue'

import { router } from '@/router'
import { useSheetsApi } from '@/stores/authStore'

import 'uno.css'
import '@unocss/reset/tailwind-v4.css'

// Mock code is imported only inside the __MOCK__ branch, so production bundles never contain it.
async function start() {
  if (__MOCK__) {
    const [{ createMockSheetsApi }, { MOCK_SHEETS }] = await Promise.all([
      import('@/services/mock/mockSheetsApi'),
      import('@/services/mock/fixtures'),
    ])
    useSheetsApi(createMockSheetsApi(MOCK_SHEETS))
  }
  createApp(App).use(createPinia()).use(router).mount('#app')
}

void start()
