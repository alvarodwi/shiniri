<script setup lang="ts">
import { onUnmounted } from 'vue'

import PickSheet from '@/components/stats/PickSheet.vue'
import { fillQuestion } from '@/services/stats/facts'
import { usePickerStore } from '@/stores/pickerStore'
import { useStatsStore } from '@/stores/statsStore'

const store = useStatsStore()
const picker = usePickerStore()
// The page keeps nothing between visits.
onUnmounted(() => {
  store.reset()
  picker.closePicker()
})
</script>

<template>
  <main class="mx-auto flex max-w-xl flex-col gap-4 px-4 pb-12">
    <h2 class="page-title py-4">Stats</h2>
    <div class="flex gap-3">
      <button type="button" class="btn-line" @click="store.roll()">Shuffle</button>
      <button type="button" class="btn-line" @click="picker.openPicker()">Pick a fact</button>
    </div>
    <section v-if="store.card.status !== 'idle'" aria-live="polite" class="rule border p-4">
      <h3 class="font-semibold">{{ store.card.fact.title }}</h3>
      <p class="ink-soft text-sm">
        {{ fillQuestion(store.card.fact, store.card.values) }}
      </p>
      <div
        v-if="store.card.fact.filters && 'options' in store.card"
        class="flex flex-wrap gap-2 py-2"
      >
        <button
          v-for="f in store.card.fact.filters"
          :key="f.id"
          type="button"
          class="btn-line"
          @click="picker.editFilter(f.id)"
        >
          {{ f.label }}: {{ store.card.values[f.id] ?? '…' }}
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
          @click="store.retry()"
        >
          Retry
        </button>
      </p>
      <button
        v-if="store.card.status !== 'loading'"
        type="button"
        class="btn-line"
        @click="store.roll()"
      >
        Shuffle
      </button>
    </section>
    <PickSheet />
  </main>
</template>
