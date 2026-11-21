<script setup lang="ts">
import { onMounted } from 'vue'

import NikkePicker from '@/components/nikke/NikkePicker.vue'
import { pullsHint } from '@/services/gacha/pulls'
import { useOrdinaryStore } from '@/stores/ordinaryStore'

const store = useOrdinaryStore()

onMounted(() => store.load())
</script>

<template>
  <main class="mx-auto flex max-w-xl flex-col gap-4 px-4 pb-24">
    <h2 class="pt-4 text-xl font-bold">Ordinary</h2>

    <!-- Only the first read hides the form; a reload after Save keeps it mounted, so focus stays. -->
    <p v-if="store.status === 'loading' && !store.nikkes.length" class="ink-soft py-8">
      Reading the sheet…
    </p>
    <template v-else>
      <div class="flex flex-wrap gap-3">
        <label class="flex flex-col gap-1 text-sm">
          Date
          <input
            v-model="store.entry.date"
            type="date"
            class="focus rule-ink paper min-h-11 border px-2"
          />
        </label>
      </div>

      <div class="flex flex-wrap gap-3">
        <div class="flex flex-col gap-1 text-sm">
          <label for="ordinary-gems">Gems (multiple of 300)</label>
          <input
            id="ordinary-gems"
            v-model="store.entry.gems"
            type="text"
            inputmode="numeric"
            autocomplete="off"
            class="focus rule-ink paper min-h-11 w-28 border px-2"
          />
        </div>
        <div class="flex flex-col gap-1 text-sm">
          <label for="ordinary-tix">Tix (vouchers)</label>
          <input
            id="ordinary-tix"
            v-model="store.entry.tix"
            type="text"
            inputmode="numeric"
            autocomplete="off"
            aria-describedby="ordinary-pulls-hint"
            class="focus rule-ink paper min-h-11 w-28 border px-2"
          />
        </div>
      </div>
      <p id="ordinary-pulls-hint" class="ink-soft text-sm" aria-live="polite">
        {{ pullsHint(store.entry) }}
      </p>

      <section class="flex flex-col gap-1 text-sm" aria-label="SSR pulled">
        <h3 class="font-semibold">SSR pulled</h3>
        <NikkePicker
          :nikkes="store.pool"
          :model-value="store.entry.names"
          @update:model-value="store.entry.names = $event"
        />
        <p aria-live="polite">SSR: {{ store.entry.names.length }}</p>
      </section>

      <label class="flex flex-col gap-1 text-sm">
        Notes
        <input
          v-model="store.entry.notes"
          type="text"
          placeholder="Optional"
          class="focus rule-ink paper min-h-11 border px-2"
        />
      </label>
    </template>

    <p v-if="store.error" role="alert" class="text-accent-ink py-3">{{ store.error }}</p>
    <p v-if="store.lastSaved" role="status" class="py-1">Saved to {{ store.lastSaved }}.</p>

    <div class="paper rule fixed inset-x-0 bottom-0 border-t px-4 py-3">
      <button
        type="button"
        class="focus press bg-charcoal text-cream dark:bg-cream dark:text-charcoal mx-auto block min-h-12 w-full max-w-xl font-semibold disabled:opacity-40"
        :disabled="!store.canSave"
        @click="store.save()"
      >
        {{ store.status === 'saving' ? 'Saving…' : 'Save session' }}
      </button>
    </div>
  </main>
</template>
