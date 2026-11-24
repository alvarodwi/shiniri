<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'
import { useRoute } from 'vue-router'

import { NAV, groupOf } from '@/router/nav'
import { useAuthStore } from '@/stores/authStore'
import { useTheme } from '@/utils/theme'

const auth = useAuthStore()
const { theme, toggle: toggleTheme } = useTheme()
const route = useRoute()
const version = __APP_VERSION__
const base = import.meta.env.BASE_URL
// Loaded only in mock mode, so builds don't carry the banner either.
const MockBanner = __MOCK__
  ? defineAsyncComponent(() => import('@/components/MockBanner.vue'))
  : null
const group = computed(() => groupOf(route.path))
</script>

<template>
  <div class="paper ink min-h-screen">
    <header class="shop-header overflow-hidden px-4 pt-3">
      <div class="relative mx-auto max-w-xl">
        <div
          class="pointer-events-none absolute -top-3 right-0 h-[4.75rem] overflow-hidden sm:h-[5.5rem]"
          style="mask-image: linear-gradient(to bottom, #000 65%, transparent)"
          aria-hidden="true"
        >
          <img
            :src="`${base}img/yan-default.webp`"
            alt=""
            width="3196"
            height="2576"
            class="h-28 w-auto max-w-none select-none sm:h-32"
          />
        </div>
        <div class="relative flex items-baseline gap-2">
          <h1 class="shop-title text-3xl leading-none">Shiniri</h1>
          <span class="text-gold text-sm" lang="ja">新入り</span>
          <button
            type="button"
            :aria-label="theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'"
            class="focus press text-cream/80 -my-3 flex min-h-11 min-w-11 items-center justify-center self-center text-lg"
            @click="toggleTheme()"
          >
            <span
              :class="theme === 'dark' ? 'i-ph-sun-duotone' : 'i-ph-moon-duotone'"
              aria-hidden="true"
            />
          </button>
          <span class="text-cream/60 hidden text-xs sm:inline">v{{ version }}</span>
        </div>
        <nav
          v-if="auth.signedIn"
          aria-label="Main"
          class="relative mt-2 flex flex-wrap items-center gap-x-4"
        >
          <RouterLink
            v-for="g in NAV"
            :key="g.key"
            :to="g.to"
            :aria-current="group?.key === g.key ? 'true' : undefined"
            class="focus flex min-h-11 items-center gap-1.5 border-b-2 text-sm whitespace-nowrap"
            :class="
              group?.key === g.key
                ? 'text-gold border-gold font-semibold'
                : 'text-cream/80 border-transparent'
            "
          >
            <span :class="g.icon" aria-hidden="true" />
            {{ g.label }}
          </RouterLink>
          <button
            aria-label="Sign out"
            class="focus press text-cream/80 flex min-h-11 min-w-11 items-center justify-center text-lg"
            @click="auth.signOut()"
          >
            <span class="i-ph-sign-out-duotone" aria-hidden="true" />
          </button>
        </nav>
        <nav
          v-if="auth.signedIn && group?.links.length"
          aria-label="Section"
          class="relative flex flex-wrap gap-x-4 pb-1"
        >
          <RouterLink
            v-for="link in group.links"
            :key="link.to"
            :to="link.to"
            class="focus flex min-h-11 items-center gap-1.5 text-sm whitespace-nowrap"
            :class="route.path === link.to ? 'text-cream font-semibold' : 'text-cream/60'"
          >
            <span
              :class="[link.icon, route.path === link.to ? 'text-gold' : '']"
              aria-hidden="true"
            />
            {{ link.label }}
          </RouterLink>
        </nav>
        <div v-else class="h-3" />
      </div>
    </header>
    <component :is="MockBanner" v-if="MockBanner" />

    <RouterView v-if="auth.signedIn" />

    <main v-else class="mx-auto flex max-w-xl flex-col items-center gap-4 pb-16 text-center">
      <img
        :src="`${base}img/yan-burst-smile.webp`"
        alt="Yan, the merchant, smiling behind her red fan"
        width="5607"
        height="2874"
        class="aspect-[16/9] w-full object-cover"
      />
      <p class="shop-title px-4 text-xl">Welcome, rookie.</p>
      <p class="ink-soft px-4 text-sm">Sign in with the Google account that owns the journal.</p>
      <button class="btn-save !mx-0 !w-auto px-6" :disabled="auth.busy" @click="auth.signIn()">
        <span class="i-ph-google-logo-bold mr-2 align-[-0.15em]" aria-hidden="true" />
        {{ auth.busy ? 'Signing in…' : 'Sign in with Google' }}
      </button>
      <p v-if="auth.error" role="alert" class="text-accent-ink px-4">{{ auth.error }}</p>
    </main>
  </div>
</template>
