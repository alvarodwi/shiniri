<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'

import SearchList from '@/components/stats/SearchList.vue'
import { CATEGORIES, FACTS } from '@/services/stats/facts'
import { usePickerStore } from '@/stores/pickerStore'
import { useStatsStore } from '@/stores/statsStore'

const stats = useStatsStore()
const store = usePickerStore()
const categories = CATEGORIES.filter((c) => FACTS.some((f) => f.category === c))
const facts = computed(() => FACTS.filter((f) => !store.category || f.category === store.category))
const pickTitle = (title: string) => store.pickFact(facts.value.find((f) => f.title === title)) // titles are unique per category
const loading = computed(() => stats.card.status === 'loading')
// Esc only fires from inside the dialog, so focus it on open and on every step (the clicked
// button is replaced), and hand focus back to the opener on close.
// shortcut: no focus trap, Tab can leave the dialog; add one if keyboard use matters.
const dialog = ref<HTMLElement | null>(null)
let opener: HTMLElement | null = null
watch(
  () => store.sheet?.step,
  async (step, was) => {
    if (step === undefined) {
      opener?.focus()
      opener = null
      return
    }
    if (was === undefined) opener = document.activeElement as HTMLElement | null
    await nextTick()
    dialog.value?.focus()
  },
)
const btn = 'btn-line text-left'
</script>

<template>
  <div
    v-if="store.sheet"
    class="fixed inset-0 z-40 flex items-end bg-black/50"
    @click.self="store.closePicker()"
    @keydown.esc="store.closePicker()"
  >
    <div
      ref="dialog"
      tabindex="-1"
      role="dialog"
      aria-modal="true"
      aria-label="Pick a fact"
      class="paper ink flex max-h-[80dvh] w-full flex-col gap-2 overflow-y-auto p-4 outline-none sm:mx-auto sm:max-w-xl"
    >
      <div class="flex items-center justify-between">
        <h3 class="font-semibold">
          {{ store.sheet.step === 'category' ? 'Category' : 'Fact' }}
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
      <template v-else>
        <button type="button" :class="btn" @click="store.pickFact()">Random</button>
        <SearchList :options="facts.map((f) => f.title)" label="facts" @pick="pickTitle" />
      </template>
    </div>
  </div>
</template>
