<script setup lang="ts">
import { CLASS_TYPES, MANUFACTURERS } from '@/types/gear'
import type { Gear } from '@/types/gear'

const props = defineProps<{ modelValue: Gear | null }>()
const emit = defineEmits<{ 'update:modelValue': [value: Gear] }>()

const isPicked = (g: Gear) =>
  props.modelValue?.classType === g.classType && props.modelValue?.manufacturer === g.manufacturer
</script>

<template>
  <div role="group" aria-label="Gear" class="grid grid-cols-[auto_repeat(5,1fr)] gap-1 text-xs">
    <span />
    <span v-for="m in MANUFACTURERS" :key="m" class="ink-soft text-center">{{
      m.slice(0, 3)
    }}</span>
    <template v-for="c in CLASS_TYPES" :key="c">
      <span class="ink-soft self-center pr-1">{{ c.slice(0, 3) }}</span>
      <button
        v-for="m in MANUFACTURERS"
        :key="m"
        type="button"
        :aria-label="`${c} ${m}`"
        :aria-pressed="isPicked({ classType: c, manufacturer: m })"
        class="focus press rule min-h-11 border"
        :class="
          isPicked({ classType: c, manufacturer: m })
            ? 'bg-accent text-charcoal border-accent-ink'
            : ''
        "
        @click="emit('update:modelValue', { classType: c, manufacturer: m })"
      >
        <span v-if="isPicked({ classType: c, manufacturer: m })" aria-hidden="true">●</span>
      </button>
    </template>
  </div>
</template>
