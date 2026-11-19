<script setup lang="ts">
import { onMounted, watch } from 'vue'

import RunCard from '@/components/anomaly/RunCard.vue'
import { ANOMALY_TAB } from '@/config/sheets'
import { useAnomalyStore } from '@/stores/anomalyStore'

const store = useAnomalyStore()
const sheetUrl = `https://docs.google.com/spreadsheets/d/${ANOMALY_TAB.spreadsheetId}/edit`

onMounted(() => store.load())
watch(
  () => store.date,
  () => store.readDay().catch((e) => (store.error = (e as Error).message)),
)
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
      <label v-if="!store.locked" class="flex min-h-11 items-center gap-2 text-sm">
        <input
          type="checkbox"
          class="size-5"
          :checked="store.doubleDay"
          @change="store.setDoubleDay(($event.target as HTMLInputElement).checked)"
        />
        Double day
      </label>
      <label v-if="!store.locked" class="flex min-h-11 items-center gap-2 text-sm">
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

    <p v-if="store.status === 'loading'" class="ink-soft py-8">Reading the sheet…</p>

    <section v-else-if="store.locked" aria-label="Logged runs">
      <p class="ink-soft text-sm">
        {{ store.loggedRows.length }} rows already logged for {{ store.date }}.
      </p>
      <ol>
        <li
          v-for="(row, i) in store.loggedRows"
          :key="i"
          class="rule flex flex-col gap-1 border-b py-3"
        >
          <span>
            <span class="inline-block w-12 font-bold">#{{ i + 1 }}</span>
            {{ row[1] }} · stage {{ row[2] }} · {{ row[3] === 'TRUE' ? 'dropped' : 'no drop' }} ·
            {{ row[4] }} modules
            <template v-if="row[5]">· {{ row[5] }} {{ row[6] }}</template>
          </span>
          <span v-if="row[8]" class="ink-soft pl-12 text-sm">{{ row[8] }}</span>
        </li>
      </ol>
      <!-- Editing the sheet on a phone is painful, so the fix hint shows on larger screens only. -->
      <p class="ink-soft hidden py-3 text-sm sm:block">
        Fix mistakes directly in the
        <a :href="sheetUrl" target="_blank" rel="noopener" class="focus underline">sheet</a>.
      </p>
    </section>

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
    <p v-if="store.lastSaved" role="status" class="py-3">
      Saved {{ store.lastSaved.count }} rows to {{ store.lastSaved.updatedRange }}.
    </p>

    <div v-if="!store.locked" class="paper rule fixed inset-x-0 bottom-0 border-t px-4 py-3">
      <button
        type="button"
        class="focus press bg-charcoal text-cream dark:bg-cream dark:text-charcoal mx-auto block min-h-12 w-full max-w-xl font-semibold disabled:opacity-40"
        :disabled="!store.canSave"
        @click="store.save()"
      >
        {{ store.status === 'saving' ? 'Saving…' : `Save ${store.runCount} rows` }}
      </button>
    </div>
  </main>
</template>
