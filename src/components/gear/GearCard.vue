<script setup lang="ts">
import ClassSlotGrid from './ClassSlotGrid.vue'
import ManufacturerTaps from './ManufacturerTaps.vue'

import type { GearCard, GearItem, GearSource } from '@/types/gear'

const props = defineProps<{ card: GearCard; index: number; source: GearSource }>()
const emit = defineEmits<{ update: [patch: Partial<GearCard>] }>()

function setSacrifice(i: 0 | 1, patch: Partial<GearItem>) {
  const sacrifices: [GearItem, GearItem] = [...props.card.sacrifices]
  sacrifices[i] = { ...sacrifices[i], ...patch }
  emit('update', { sacrifices })
}
</script>

<template>
  <section class="rule flex flex-col gap-3 border-b py-4" :aria-label="`Item ${index + 1}`">
    <span class="font-bold">#{{ index + 1 }}</span>

    <template v-if="source === 'furnace'">
      <h3 class="text-sm font-semibold">Target manufacturer</h3>
      <ManufacturerTaps
        label="Target manufacturer"
        :model-value="card.target"
        @update:model-value="emit('update', { target: $event })"
      />

      <template v-for="i in [0, 1] as const" :key="i">
        <h3 class="text-sm font-semibold">Sacrifice {{ i + 1 }}</h3>
        <ManufacturerTaps
          :label="`Sacrifice ${i + 1} manufacturer`"
          :model-value="card.sacrifices[i].manufacturer"
          @update:model-value="setSacrifice(i, { manufacturer: $event })"
        />
        <ClassSlotGrid
          :label="`Sacrifice ${i + 1} class and slot`"
          :class-type="card.sacrifices[i].classType"
          :slot-type="card.sacrifices[i].slot"
          @pick="setSacrifice(i, $event)"
        />
      </template>

      <h3 class="text-sm font-semibold">
        Result<span v-if="card.target" class="ink-soft font-normal"> ({{ card.target }})</span>
      </h3>
      <ClassSlotGrid
        label="Result class and slot"
        :class-type="card.classType"
        :slot-type="card.slot"
        @pick="emit('update', $event)"
      />
    </template>

    <template v-else>
      <ManufacturerTaps
        label="Manufacturer"
        :model-value="card.manufacturer"
        @update:model-value="emit('update', { manufacturer: $event })"
      />
      <ClassSlotGrid
        label="Class and slot"
        :class-type="card.classType"
        :slot-type="card.slot"
        @pick="emit('update', $event)"
      />
    </template>
  </section>
</template>
