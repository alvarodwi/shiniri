<script setup lang="ts">
import { useRoute } from 'vue-router'

import { useAuthStore } from '@/stores/authStore'

const auth = useAuthStore()
const route = useRoute()
const version = __APP_VERSION__
const links = [
  { to: '/anomaly', label: 'Anomaly' },
  { to: '/gear', label: 'Gear' },
  { to: '/special', label: 'Special' },
  { to: '/log', label: 'Log' },
]
</script>

<template>
  <div class="paper ink min-h-screen">
    <header class="rule flex flex-wrap items-center gap-x-3 border-b px-4 py-3">
      <h1 class="text-lg font-bold">Shiniri</h1>
      <span class="ink-soft text-xs">v{{ version }}</span>
      <nav v-if="auth.signedIn" class="flex gap-3 text-sm">
        <RouterLink
          v-for="link in links"
          :key="link.to"
          :to="link.to"
          class="focus flex min-h-11 items-center"
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
