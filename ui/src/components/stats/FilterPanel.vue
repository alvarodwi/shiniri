<script setup lang="ts">
import { onMounted, ref } from 'vue'

import DateRangeInput from '@/components/stats/DateRangeInput.vue'
import SearchList from '@/components/stats/SearchList.vue'
import type { Filter } from '@/services/stats/facts'

// The editor of one filter: gold-edged, so it can't be read as part of the answer.
defineProps<{ filter: Filter; options: string[]; value?: string }>()
// No value = random.
const emit = defineEmits<{ pick: [value?: string]; close: [] }>()

// Esc only fires from inside, and the button that opened or filled the panel may be gone.
const panel = ref<HTMLElement | null>(null)
onMounted(() => panel.value?.focus())
</script>

<template>
  <div
    ref="panel"
    tabindex="-1"
    role="group"
    :aria-label="`Choose ${filter.label}`"
    class="border-gold mb-2 flex flex-col gap-3 border-2 bg-black/5 p-3 outline-none dark:bg-black/25"
    @keydown.esc="emit('close')"
  >
    <div class="flex items-center justify-between gap-2">
      <h4 class="font-semibold">Choose {{ filter.label }}</h4>
      <div class="flex gap-2">
        <button type="button" class="btn-line" @click="emit('pick')">Random</button>
        <button type="button" class="btn-line" @click="emit('close')">Close</button>
      </div>
    </div>
    <DateRangeInput
      v-if="filter.kind === 'dateRange'"
      :options="options"
      :value="value"
      @pick="(v) => emit('pick', v)"
    />
    <SearchList
      v-else
      :options="options"
      :label="filter.label"
      :selected="value"
      @pick="(v) => emit('pick', v)"
    />
  </div>
</template>
