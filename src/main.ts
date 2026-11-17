import { createPinia } from 'pinia'
import { createApp } from 'vue'

import App from './App.vue'

import { router } from '@/router'

import 'uno.css'
import '@unocss/reset/tailwind-v4.css'

createApp(App).use(createPinia()).use(router).mount('#app')
