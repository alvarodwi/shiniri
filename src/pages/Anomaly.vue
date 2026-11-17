<script setup lang="ts">
import { onMounted, watch } from 'vue'

import RunCard from '@/components/anomaly/RunCard.vue'
import { useAnomalyStore } from '@/stores/anomalyStore'

const store = useAnomalyStore()

onMounted(() => store.load())
watch(
  () => store.date,
  () => store.refreshCount().catch((e) => (store.error = (e as Error).message)),
)

function confirmDuplicate(existing: number, after: number): boolean {
  const loud =
    after > store.dailyLimit
      ? `\n\nThat makes ${after} rows, more than the daily limit of ${store.dailyLimit}.`
      : ''
  return window.confirm(`${store.date} already has ${existing} rows.${loud}\n\nSave anyway?`)
}
</script>

<template>
  <main class="mx-auto flex max-w-xl flex-col px-4 pb-24">
    <div class="flex flex-wrap items-center gap-3 py-4">
      <h2 class="text-xl font-bold">Anomaly</h2>
      <input
        v-model="store.date"
        type="date"
        aria-label="Date"
        class="focus rule-ink paper min-h-11 border px-2"
      />
      <label class="flex min-h-11 items-center gap-2 text-sm">
        <input
          type="checkbox"
          class="size-5"
          :checked="store.doubleDay"
          @change="store.setDoubleDay(($event.target as HTMLInputElement).checked)"
        />
        Double day
      </label>
      <label class="flex min-h-11 items-center gap-2 text-sm">
        Runs
        <input
          :value="store.runCount"
          type="number"
          min="1"
          :max="store.dailyLimit"
          class="focus rule-ink paper min-h-11 w-14 border px-2 text-center"
          @change="store.setRunCount(Number(($event.target as HTMLInputElement).value))"
        />
      </label>
    </div>

    <p v-if="store.existingForDate" class="ink-soft text-sm">
      {{ store.existingForDate }} rows already logged for {{ store.date }}.
    </p>

    <p v-if="store.status === 'loading'" class="ink-soft py-8">Reading the sheet…</p>

    <template v-else>
      <RunCard
        v-for="(run, i) in store.activeRuns"
        :key="i"
        :run="run"
        :index="i"
        @defaults="store.setBossOrStage(i, $event)"
        @update="store.setRun(i, $event)"
      />
    </template>

    <p v-if="store.error" role="alert" class="text-accent-ink py-3">{{ store.error }}</p>
    <p v-if="store.status === 'saved' && store.lastSaved" role="status" class="py-3">
      Saved {{ store.lastSaved.count }} rows to {{ store.lastSaved.updatedRange }}.
    </p>

    <div class="paper rule fixed inset-x-0 bottom-0 border-t px-4 py-3">
      <button
        type="button"
        class="focus press bg-charcoal text-cream dark:bg-cream dark:text-charcoal mx-auto block min-h-12 w-full max-w-xl font-semibold disabled:opacity-40"
        :disabled="!store.canSave"
        @click="store.save(undefined, confirmDuplicate)"
      >
        {{ store.status === 'saving' ? 'Saving…' : `Save ${store.runCount} rows` }}
      </button>
    </div>
  </main>
</template>
