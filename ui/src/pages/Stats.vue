<script setup lang="ts">
import { nextTick, onUnmounted, ref } from 'vue'

import FilterPanel from '@/components/stats/FilterPanel.vue'
import PickSheet from '@/components/stats/PickSheet.vue'
import { fillQuestion } from '@/services/stats/facts'
import type { Filter } from '@/services/stats/facts'
import { chipText } from '@/services/stats/ranges'
import { usePickerStore } from '@/stores/pickerStore'
import { useStatsStore } from '@/stores/statsStore'

const store = useStatsStore()
const picker = usePickerStore()
// The page keeps nothing between visits.
onUnmounted(() => {
  store.reset()
  picker.reset()
})

const chip = (f: Filter) => {
  const v = 'values' in store.card ? store.card.values[f.id] : undefined
  if (v === undefined) return '…'
  return f.kind === 'dateRange' ? chipText(v) : v
}
// The panel took the focus; hand it back to the chip when it closes.
const chips = ref<HTMLElement | null>(null)
async function focusChip(id: string) {
  await nextTick()
  if (!picker.openFilter) chips.value?.querySelector<HTMLElement>(`[data-id="${id}"]`)?.focus()
}
function closePanel(id: string) {
  picker.closeFilter()
  focusChip(id)
}
async function pick(id: string, value?: string) {
  await picker.pickFilter(id, value)
  focusChip(id)
}
</script>

<template>
  <main class="mx-auto flex max-w-xl flex-col gap-4 px-4 pb-12">
    <h2 class="page-title py-4">Stats</h2>
    <div class="flex gap-3">
      <button type="button" class="btn-line" @click="picker.roll()">Shuffle</button>
      <button type="button" class="btn-line" @click="picker.openPicker()">Pick a fact</button>
    </div>
    <section v-if="store.card.status !== 'idle'" aria-live="polite" class="rule border p-4">
      <h3 class="font-semibold">{{ store.card.fact.title }}</h3>
      <p class="ink-soft text-sm">
        {{ fillQuestion(store.card.fact, store.card.values) }}
      </p>
      <div
        v-if="store.card.fact.filters && 'options' in store.card"
        ref="chips"
        class="flex flex-wrap gap-2 py-2"
      >
        <button
          v-for="f in store.card.fact.filters"
          :key="f.id"
          type="button"
          class="btn-line"
          :class="picker.openFilter === f.id && '!border-gold border-b-4 font-semibold'"
          :aria-expanded="picker.openFilter === f.id"
          :data-id="f.id"
          @click="picker.toggleFilter(f.id)"
        >
          {{ f.label }}: {{ chip(f) }}
        </button>
      </div>
      <template v-for="f in store.card.fact.filters" :key="f.id">
        <FilterPanel
          v-if="picker.openFilter === f.id && 'options' in store.card"
          :filter="f"
          :options="store.card.options[f.id] ?? []"
          :value="store.card.values[f.id]"
          @pick="(v) => pick(f.id, v)"
          @close="closePanel(f.id)"
        />
      </template>
      <p v-if="store.card.status === 'loading'" class="ink-soft py-2">Reading…</p>
      <p
        v-else-if="store.card.status === 'ready' && !picker.openFilter"
        class="py-2 text-3xl font-semibold"
      >
        {{ store.card.answer }}
      </p>
      <p v-else-if="store.card.status === 'empty' && !picker.openFilter" class="ink-soft py-2">
        No answer.
      </p>
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
        @click="picker.roll()"
      >
        Shuffle
      </button>
    </section>
    <PickSheet />
  </main>
</template>
