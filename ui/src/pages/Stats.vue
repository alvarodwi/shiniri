<script setup lang="ts">
import { onUnmounted } from 'vue'

import { fillQuestion } from '@/services/stats/facts'
import { useStatsStore } from '@/stores/statsStore'

const store = useStatsStore()
// The page keeps nothing between visits.
onUnmounted(() => (store.card = { status: 'idle' }))
</script>

<template>
  <main class="mx-auto flex max-w-xl flex-col gap-4 px-4 pb-12">
    <h2 class="page-title py-4">Stats</h2>
    <div class="flex gap-3">
      <button
        type="button"
        class="focus press rule-ink min-h-11 border px-3 text-sm"
        @click="store.roll()"
      >
        Random fact
      </button>
      <!-- Pick opens its sheet in a later slice. -->
      <button type="button" class="focus press rule-ink min-h-11 border px-3 text-sm">
        Pick a fact
      </button>
    </div>
    <section v-if="store.card.status !== 'idle'" aria-live="polite" class="rule border p-4">
      <h3 class="font-semibold">{{ store.card.fact.title }}</h3>
      <p class="ink-soft text-sm">
        {{ fillQuestion(store.card.fact.question, store.card.values) }}
      </p>
      <div
        v-for="f in store.card.fact.filters"
        v-show="'options' in store.card"
        :key="f.id"
        role="group"
        :aria-label="f.label"
        class="flex flex-wrap gap-2 py-2"
      >
        <button
          v-for="o in 'options' in store.card ? store.card.options[f.id] : []"
          :key="o"
          type="button"
          :aria-pressed="store.card.values[f.id] === o"
          class="focus press rule-ink min-h-11 border px-3 text-sm"
          :class="{ 'font-semibold': store.card.values[f.id] === o }"
          @click="store.setFilter(f.id, o)"
        >
          {{ o }}
        </button>
      </div>
      <p v-if="store.card.status === 'loading'" class="ink-soft py-2">Reading…</p>
      <p v-else-if="store.card.status === 'ready'" class="py-2 text-3xl font-semibold">
        {{ store.card.answer }}
      </p>
      <p v-else-if="store.card.status === 'empty'" class="ink-soft py-2">No answer.</p>
      <p v-else-if="store.card.status === 'error'" role="alert" class="text-accent-ink py-2">
        {{ store.card.error }}
        <button
          type="button"
          class="focus press rule-ink ml-2 min-h-11 border px-3 text-sm"
          @click="store.show(store.card.fact, undefined, store.card.values)"
        >
          Retry
        </button>
      </p>
    </section>
  </main>
</template>
