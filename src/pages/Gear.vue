<script setup lang="ts">
import GearCard from '@/components/gear/GearCard.vue'
import { useGearStore } from '@/stores/gearStore'
import { GEAR_SOURCES } from '@/types/gear'
import type { GearSource } from '@/types/gear'

const store = useGearStore()

// Arms is gacha (log what came out); a Selection Box is a choice (log what was picked).
const HINTS: Record<GearSource, string> = {
  arms: 'Gacha: log exactly what each Arms gave you.',
  box: 'Your pick: make sure each one is what you actually chose in the box.',
  furnace: 'One card per attempt: pick the target, both sacrifices, then the result.',
}

// Writing the clamped value back keeps the box in sync even when the store value didn't change.
function setCountFrom(input: HTMLInputElement) {
  store.setCount(Number(input.value))
  input.value = String(store.count)
}
</script>

<template>
  <main class="mx-auto flex max-w-xl flex-col px-4 pb-24">
    <div class="flex flex-wrap items-center gap-3 py-4">
      <h2 class="text-xl font-bold">Gear</h2>
      <input
        v-model="store.date"
        type="date"
        aria-label="Date"
        class="focus rule-ink paper min-h-11 border px-2"
      />
      <select
        class="focus rule-ink paper min-h-11 border px-2"
        aria-label="Source"
        :value="store.source"
        @change="store.setSource(($event.target as HTMLSelectElement).value as GearSource)"
      >
        <option v-for="(label, key) in GEAR_SOURCES" :key="key" :value="key">{{ label }}</option>
      </select>
      <label class="flex min-h-11 items-center gap-2 text-sm">
        Items
        <input
          :value="store.count"
          type="number"
          min="1"
          max="100"
          class="focus rule-ink paper min-h-11 w-16 border px-2 text-center"
          @change="setCountFrom($event.target as HTMLInputElement)"
        />
      </label>
    </div>

    <p class="ink-soft text-sm">{{ HINTS[store.source] }}</p>

    <GearCard
      v-for="(card, i) in store.activeCards"
      :key="i"
      :card="card"
      :index="i"
      :source="store.source"
      @update="store.setCard(i, $event)"
    />

    <p v-if="store.error" role="alert" class="text-accent-ink py-3">{{ store.error }}</p>
    <p v-for="saved in store.lastSaved" :key="saved.updatedRange" role="status" class="py-1">
      Saved {{ saved.count }} rows to {{ saved.updatedRange }}.
    </p>

    <div class="paper rule fixed inset-x-0 bottom-0 border-t px-4 py-3">
      <button
        type="button"
        class="focus press bg-charcoal text-cream dark:bg-cream dark:text-charcoal mx-auto block min-h-12 w-full max-w-xl font-semibold disabled:opacity-40"
        :disabled="!store.canSave"
        @click="store.save()"
      >
        {{
          store.status === 'saving'
            ? 'Saving…'
            : `Save ${store.count} ${store.count === 1 ? 'item' : 'items'}`
        }}
      </button>
    </div>
  </main>
</template>
