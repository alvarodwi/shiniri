<script setup lang="ts">
import type { ModuleCount } from '@/types/anomaly'

defineProps<{ modelValue: ModuleCount | null }>()
const emit = defineEmits<{ 'update:modelValue': [value: ModuleCount] }>()
const counts: ModuleCount[] = [0, 1, 2, 3]
</script>

<template>
  <div role="group" aria-label="Modules" class="flex gap-2">
    <button
      v-for="n in counts"
      :key="n"
      type="button"
      :aria-pressed="modelValue === n"
      class="focus press rule-ink size-11 border text-lg font-semibold"
      :class="modelValue === n ? 'bg-charcoal text-cream dark:bg-cream dark:text-charcoal' : ''"
      @click="emit('update:modelValue', n)"
    >
      {{ n }}
    </button>
  </div>
</template>
