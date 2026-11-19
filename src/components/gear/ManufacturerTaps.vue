<script setup lang="ts">
import { MANUFACTURERS } from '@/types/gear'
import type { Manufacturer } from '@/types/gear'

defineProps<{ modelValue: Manufacturer | null; label: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: Manufacturer] }>()
</script>

<template>
  <div role="group" :aria-label="label" class="flex flex-wrap gap-2">
    <button
      v-for="m in MANUFACTURERS"
      :key="m"
      type="button"
      :aria-pressed="modelValue === m"
      class="focus press rule-ink min-h-11 border px-3 text-sm font-semibold"
      :class="modelValue === m ? 'bg-charcoal text-cream dark:bg-cream dark:text-charcoal' : ''"
      @click="emit('update:modelValue', m)"
    >
      {{ m }}
    </button>
  </div>
</template>
