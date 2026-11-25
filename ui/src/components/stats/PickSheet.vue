<script setup lang="ts">
import { computed } from 'vue'

import { FACTS } from '@/services/stats/facts'
import { useStatsStore } from '@/stores/statsStore'

const store = useStatsStore()
const categories = [...new Set(FACTS.map((f) => f.category))]
const facts = computed(() => FACTS.filter((f) => !store.category || f.category === store.category))
// Filter steps read the chosen fact's loaded card.
const filter = computed(() => {
  const c = store.card
  const step = store.sheet?.step
  if (c.status === 'idle' || !step) return null
  const f = c.fact.filters?.find((x) => x.id === step)
  return f ? { ...f, options: 'options' in c ? (c.options[f.id] ?? []) : [] } : null
})
const loading = computed(() => store.card.status === 'loading')
const btn = 'focus press rule-ink min-h-11 border px-3 text-sm text-left'
</script>

<template>
  <div
    v-if="store.sheet"
    class="fixed inset-0 z-40 flex items-end bg-black/50"
    @click.self="store.closePicker()"
    @keydown.esc="store.closePicker()"
  >
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Pick a fact"
      class="paper ink flex max-h-[80vh] w-full flex-col gap-2 overflow-y-auto p-4 sm:mx-auto sm:max-w-xl"
    >
      <div class="flex items-center justify-between">
        <h3 class="font-semibold">
          {{
            store.sheet.step === 'category'
              ? 'Category'
              : store.sheet.step === 'fact'
                ? 'Fact'
                : (filter?.label ?? 'Filter')
          }}
        </h3>
        <button type="button" :class="btn" @click="store.closePicker()">Close</button>
      </div>
      <p v-if="loading" class="ink-soft py-2">Reading…</p>
      <template v-else-if="store.sheet.step === 'category'">
        <button type="button" :class="btn" @click="store.pickCategory()">Random</button>
        <button
          v-for="c in categories"
          :key="c"
          type="button"
          :class="btn"
          @click="store.pickCategory(c)"
        >
          {{ c }}
        </button>
      </template>
      <template v-else-if="store.sheet.step === 'fact'">
        <button type="button" :class="btn" @click="store.pickFact()">Random</button>
        <button
          v-for="f in facts"
          :key="f.id"
          type="button"
          :class="btn"
          @click="store.pickFact(f)"
        >
          {{ f.title }}
        </button>
      </template>
      <template v-else-if="filter">
        <button type="button" :class="btn" @click="store.pickFilter(filter.id)">Random</button>
        <button
          v-for="o in filter.options"
          :key="o"
          type="button"
          :class="btn"
          @click="store.pickFilter(filter.id, o)"
        >
          {{ o }}
        </button>
      </template>
    </div>
  </div>
</template>
