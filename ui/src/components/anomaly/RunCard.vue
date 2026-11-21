<script setup lang="ts">
import { ref } from 'vue'

import GearGrid from './GearGrid.vue'
import ModuleTaps from './ModuleTaps.vue'

import { needsGear } from '@/services/anomaly/anomalyRows'
import { BOSSES } from '@/types/anomaly'
import type { AnomalyRun, Boss, RunDefaults } from '@/types/anomaly'

const props = defineProps<{ run: AnomalyRun; index: number }>()
const emit = defineEmits<{
  defaults: [patch: Partial<RunDefaults>]
  update: [patch: Partial<AnomalyRun>]
}>()

const noteOpen = ref(props.run.note !== '')
const stages = [1, 2, 3, 4, 5, 6, 7, 8, 9]
</script>

<template>
  <section class="rule flex flex-col gap-3 border-b py-4" :aria-label="`Run ${index + 1}`">
    <div class="flex flex-wrap items-center gap-2">
      <span class="w-12 font-bold">#{{ index + 1 }}</span>
      <select
        class="focus rule-ink paper min-h-11 border px-2"
        aria-label="Boss"
        :value="run.boss"
        @change="emit('defaults', { boss: ($event.target as HTMLSelectElement).value as Boss })"
      >
        <option v-for="b in BOSSES" :key="b" :value="b">{{ b }}</option>
      </select>
      <select
        class="focus rule-ink paper min-h-11 border px-2"
        aria-label="Stage"
        :value="run.stage"
        @change="emit('defaults', { stage: Number(($event.target as HTMLSelectElement).value) })"
      >
        <option v-for="s in stages" :key="s" :value="s">Stage {{ s }}</option>
      </select>
      <label v-if="run.stage !== 9" class="flex min-h-11 items-center gap-2 text-sm">
        <input
          type="checkbox"
          class="size-5"
          :checked="run.dropped"
          @change="emit('update', { dropped: ($event.target as HTMLInputElement).checked })"
        />
        Dropped
      </label>
    </div>

    <ModuleTaps
      :model-value="run.modules"
      @update:model-value="emit('update', { modules: $event })"
    />

    <GearGrid
      v-if="needsGear(run)"
      :model-value="run.gear"
      @update:model-value="emit('update', { gear: $event })"
    />

    <button
      v-if="!noteOpen"
      type="button"
      class="focus ink-soft self-start text-sm underline"
      @click="noteOpen = true"
    >
      Add note
    </button>
    <input
      v-else
      type="text"
      class="focus rule-ink paper min-h-11 border px-2"
      placeholder="Note (event, update, anything unusual)"
      aria-label="Note"
      :value="run.note"
      @input="emit('update', { note: ($event.target as HTMLInputElement).value })"
    />
  </section>
</template>
