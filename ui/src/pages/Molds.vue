<script setup lang="ts">
import { computed, onMounted } from 'vue'

import NikkePicker from '@/components/nikke/NikkePicker.vue'
import { isPerfect } from '@/services/molds/moldRows'
import { useMoldsStore } from '@/stores/moldsStore'
import { MOLD_TYPES } from '@/types/molds'
import type { MoldType } from '@/types/molds'

const store = useMoldsStore()

const amount = computed(() =>
  /^\d+$/.test(store.entry.amount.trim()) ? Number(store.entry.amount) : null,
)
const tooMany = computed(() => amount.value !== null && store.entry.names.length > amount.value)
const short = computed(
  () =>
    amount.value !== null &&
    !!store.entry.moldType &&
    isPerfect(store.entry.moldType) &&
    store.entry.names.length < amount.value,
)

onMounted(() => store.load())
</script>

<template>
  <div class="mx-auto flex max-w-xl flex-col gap-4 px-4 pb-24">
    <h2 class="page-title pt-4">Mold</h2>

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
        <label class="flex flex-col gap-1 text-sm">
          Mold type
          <select
            :value="store.entry.moldType"
            class="focus rule-ink paper min-h-11 border px-2"
            @change="store.setMoldType(($event.target as HTMLSelectElement).value as MoldType)"
          >
            <option value="" disabled>Pick a mold</option>
            <option v-for="t in MOLD_TYPES" :key="t" :value="t">{{ t }}</option>
          </select>
        </label>
        <div class="flex flex-col gap-1 text-sm">
          <label for="molds-amount">Amount opened</label>
          <input
            id="molds-amount"
            v-model="store.entry.amount"
            type="text"
            inputmode="numeric"
            autocomplete="off"
            class="focus rule-ink paper min-h-11 w-28 border px-2"
          />
        </div>
      </div>

      <section class="flex flex-col gap-1 text-sm" aria-label="SSR pulled">
        <h3 class="font-semibold">SSR pulled</h3>
        <NikkePicker
          :nikkes="store.pool"
          :model-value="store.entry.names"
          @update:model-value="store.entry.names = $event"
        />
        <p aria-live="polite">
          SSR: {{ store.entry.names.length }} / {{ store.entry.amount.trim() || '?' }}
        </p>
        <p v-if="tooMany" class="text-accent-ink">More SSRs than molds opened.</p>
        <p v-else-if="short" class="text-accent-ink">
          Perfect molds always give an SSR: pick one per mold.
        </p>
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
    <p
      v-if="store.lastSaved"
      :key="store.lastSaved"
      role="status"
      class="stamp-in text-seal dark:text-gold flex items-center gap-2 py-1"
    >
      <span class="i-ph-seal-check-duotone text-2xl" aria-hidden="true" />
      <span class="ink">Saved to {{ store.lastSaved }}.</span>
    </p>
    <p v-if="store.remark" role="status" class="py-1">{{ store.remark }}</p>

    <div class="savebar">
      <button type="button" class="btn-save" :disabled="!store.canSave" @click="store.save()">
        {{ store.status === 'saving' ? 'Saving…' : 'Save session' }}
      </button>
    </div>
  </div>
</template>
