<script setup lang="ts">
import { computed, onMounted } from 'vue'

import { useLevelStore } from '@/stores/levelStore'

const store = useLevelStore()

onMounted(() => store.load())

const rows = (n: number) => `${n} ${n === 1 ? 'row' : 'rows'}`

const preview = computed(() => {
  const last = `Last logged: ${store.last ?? 'none'}${store.lastDate ? ` on ${store.lastDate}` : ''}.`
  const steps = store.steps
  if (!steps.length)
    return store.last === null
      ? `${last} Enter a multiple of 5.`
      : `${last} Enter a multiple of 5 above ${store.last}, at most 100 steps.`
  // A long jump would wrap over several lines on a phone, so it shows only its ends.
  const list = steps.length > 4 ? `${steps[0]} … ${steps[steps.length - 1]}` : steps.join(', ')
  return `${last} Writes ${rows(steps.length)}: ${list}`
})

// An emptied box reads as NaN; null keeps Save disabled without a misleading number.
function setTarget(input: HTMLInputElement) {
  store.target = input.value === '' ? null : Number(input.value)
}
</script>

<template>
  <main class="mx-auto flex max-w-xl flex-col gap-4 px-4 pb-24">
    <div class="flex flex-wrap items-center gap-3 pt-4">
      <h2 class="text-xl font-bold">Level</h2>
      <input
        v-model="store.date"
        type="date"
        aria-label="Date"
        class="focus rule-ink paper min-h-11 border px-2"
      />
    </div>

    <p v-if="store.status === 'loading'" class="ink-soft py-8">Reading the sheet…</p>
    <template v-else>
      <label class="flex flex-col gap-1 text-sm">
        Level reached
        <input
          :value="store.target ?? ''"
          type="number"
          inputmode="numeric"
          step="5"
          min="5"
          class="focus rule-ink paper min-h-11 w-32 border px-2"
          @input="setTarget($event.target as HTMLInputElement)"
        />
      </label>

      <label class="flex flex-col gap-1 text-sm">
        Note
        <input
          v-model="store.note"
          type="text"
          class="focus rule-ink paper min-h-11 border px-2"
          placeholder="Optional"
        />
      </label>

      <p class="ink-soft text-sm" aria-live="polite">{{ preview }}</p>
      <p v-if="store.dateProblem" class="text-accent-ink text-sm">{{ store.dateProblem }}</p>
    </template>

    <p v-if="store.error" role="alert" class="text-accent-ink py-3">{{ store.error }}</p>
    <p v-if="store.lastSaved" role="status" class="py-1">
      Saved {{ rows(store.lastSaved.count) }} to {{ store.lastSaved.updatedRange }}.
    </p>

    <div class="paper rule fixed inset-x-0 bottom-0 border-t px-4 py-3">
      <button
        type="button"
        class="focus press bg-charcoal text-cream dark:bg-cream dark:text-charcoal mx-auto block min-h-12 w-full max-w-xl font-semibold disabled:opacity-40"
        :disabled="!store.canSave"
        @click="store.save()"
      >
        {{ store.status === 'saving' ? 'Saving…' : 'Save level' }}
      </button>
    </div>
  </main>
</template>
