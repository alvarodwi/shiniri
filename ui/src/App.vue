<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import { useRoute } from 'vue-router'

import { useAuthStore } from '@/stores/authStore'

const auth = useAuthStore()
const route = useRoute()
const version = __APP_VERSION__
// Loaded only in mock mode, so builds don't carry the banner either.
const MockBanner = __MOCK__
  ? defineAsyncComponent(() => import('@/components/MockBanner.vue'))
  : null
const links = [
  { to: '/anomaly', label: 'Anomaly' },
  { to: '/event', label: 'Event' },
  { to: '/ordinary', label: 'Ordinary' },
  { to: '/mold', label: 'Mold' },
  { to: '/exchange', label: 'Exchange' },
  { to: '/extra', label: 'Extra' },
  { to: '/spending', label: 'Spending' },
  { to: '/gear', label: 'Gear' },
  { to: '/level', label: 'Level' },
  { to: '/social', label: 'Social' },
  { to: '/solo-raid', label: 'Solo Raid' },
  { to: '/special', label: 'Special' },
  { to: '/costumes', label: 'Costumes' },
  { to: '/log', label: 'Log' },
]
</script>

<template>
  <div class="paper ink min-h-screen">
    <header class="rule flex flex-wrap items-center gap-x-3 border-b px-4 py-3">
      <h1 class="text-lg font-bold">Shiniri</h1>
      <span class="ink-soft text-xs">v{{ version }}</span>
      <nav v-if="auth.signedIn" class="flex flex-wrap gap-x-3 text-sm">
        <RouterLink
          v-for="link in links"
          :key="link.to"
          :to="link.to"
          class="focus flex min-h-11 items-center whitespace-nowrap"
          :class="route.path === link.to ? 'ink font-semibold underline' : 'ink-soft'"
        >
          {{ link.label }}
        </RouterLink>
      </nav>
      <button
        v-if="auth.signedIn"
        class="focus press rule-ink ml-auto min-h-11 border px-3 text-sm"
        @click="auth.signOut()"
      >
        Sign out
      </button>
    </header>
    <component :is="MockBanner" v-if="MockBanner" />

    <RouterView v-if="auth.signedIn" />

    <main v-else class="flex flex-col items-center gap-4 px-4 py-16 text-center">
      <p class="ink-soft">Sign in with the Google account that owns the journal.</p>
      <button
        class="focus press bg-charcoal text-cream dark:bg-cream dark:text-charcoal min-h-11 px-5"
        :disabled="auth.busy"
        @click="auth.signIn()"
      >
        {{ auth.busy ? 'Signing in…' : 'Sign in with Google' }}
      </button>
      <p v-if="auth.error" role="alert" class="text-accent-ink">{{ auth.error }}</p>
    </main>
  </div>
</template>
