<script setup lang="ts">
import { computed, ref } from 'vue'

import { ANY_PERIOD, RANGE_PRESETS, customRange, dateFields } from '@/services/stats/ranges'
import { gameDay } from '@/utils/gameDay'

const props = defineProps<{ options: string[]; value?: string }>()
const emit = defineEmits<{ pick: [range: string] }>()

const today = gameDay()
// The fields show the current choice; the panel is rebuilt after every pick.
const [start, end] = dateFields(props.value, today)
const from = ref(start)
const to = ref(end)
const customOk = computed(
  () => from.value !== '' && to.value !== '' && from.value <= to.value && from.value <= today,
)

const groups = computed(() =>
  [
    { label: '', options: [ANY_PERIOD] },
    { label: 'Quick', options: props.options.filter((o) => RANGE_PRESETS.includes(o)) },
    { label: 'Years', options: props.options.filter((o) => o.startsWith('in ')) },
  ].filter((g) => g.options.length),
)

const head = 'ink-soft text-xs font-semibold uppercase tracking-wide'
const field = 'focus rule-ink paper min-h-11 w-full border px-2'
</script>

<template>
  <div v-for="g in groups" :key="g.label" class="flex flex-col gap-1">
    <p v-if="g.label" :class="head">{{ g.label }}</p>
    <div class="grid gap-2" :class="g.label && 'grid-cols-2'">
      <button
        v-for="o in g.options"
        :key="o"
        type="button"
        class="btn-line"
        :class="o === value && 'tap-on'"
        :aria-pressed="o === value"
        @click="emit('pick', o)"
      >
        {{ o }}
      </button>
    </div>
  </div>
  <form
    class="flex flex-col gap-1"
    @submit.prevent="customOk && emit('pick', customRange(from, to, today))"
  >
    <p :class="head">Custom</p>
    <div class="grid grid-cols-2 gap-2">
      <label class="text-sm"
        >From<input v-model="from" type="date" :max="today" :class="field"
      /></label>
      <label class="text-sm"
        >To<input v-model="to" type="date" :max="today" :class="field"
      /></label>
    </div>
    <button type="submit" class="btn-line disabled:opacity-45" :disabled="!customOk">
      Use these dates
    </button>
  </form>
</template>
