<script setup lang="ts">
import { CLASS_TYPES, SLOTS } from '@/types/gear'
import type { ClassType, Slot } from '@/types/gear'

const props = defineProps<{ classType: ClassType | null; slotType: Slot | null; label: string }>()
const emit = defineEmits<{ pick: [value: { classType: ClassType; slot: Slot }] }>()

const isPicked = (c: ClassType, s: Slot) => props.classType === c && props.slotType === s
</script>

<template>
  <div role="group" :aria-label="label" class="grid grid-cols-[auto_repeat(4,1fr)] gap-1 text-xs">
    <span />
    <span v-for="s in SLOTS" :key="s" class="ink-soft text-center">{{ s }}</span>
    <template v-for="c in CLASS_TYPES" :key="c">
      <span class="ink-soft self-center pr-1">{{ c.slice(0, 3) }}</span>
      <button
        v-for="s in SLOTS"
        :key="s"
        type="button"
        :aria-label="`${c} ${s}`"
        :aria-pressed="isPicked(c, s)"
        class="focus press rule min-h-11 border"
        :class="isPicked(c, s) ? 'bg-accent text-charcoal border-accent-ink' : ''"
        @click="emit('pick', { classType: c, slot: s })"
      >
        <span v-if="isPicked(c, s)" aria-hidden="true">●</span>
      </button>
    </template>
  </div>
</template>
