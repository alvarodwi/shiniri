<script setup lang="ts">
import { onMounted } from 'vue'

import FieldLabel from '@/components/FieldLabel.vue'
import NikkePicker from '@/components/nikke/NikkePicker.vue'
import { pullsHint } from '@/services/gacha/pulls'
import { useEventStore } from '@/stores/eventStore'
import { RATE_UP_TYPES } from '@/types/event'

const store = useEventStore()

onMounted(() => store.load())
</script>

<template>
  <div class="mx-auto flex max-w-xl flex-col gap-4 px-4 pb-24">
    <h2 class="page-title pt-4">Event</h2>

    <!-- Only the first read hides the form; a reload after Save keeps it mounted, so focus stays. -->
    <p v-if="store.status === 'loading' && !store.nikkes.length" class="ink-soft py-8">
      Reading the sheet…
    </p>
    <template v-else>
      <div class="flex flex-wrap gap-3">
        <label class="flex flex-col gap-1 text-sm">
          Date
          <input
            :value="store.entry.date"
            type="date"
            class="focus rule-ink paper min-h-11 border px-2"
            @input="store.setDate(($event.target as HTMLInputElement).value)"
          />
        </label>
        <label class="flex flex-col gap-1 text-sm">
          Banner type
          <select
            :value="store.entry.rateUpType"
            class="focus rule-ink paper min-h-11 border px-2"
            @change="store.setRateUpType(($event.target as HTMLSelectElement).value)"
          >
            <option value="" disabled>Choose…</option>
            <option v-for="t in RATE_UP_TYPES" :key="t" :value="t">{{ t }}</option>
          </select>
        </label>
      </div>

      <section class="flex flex-col gap-1 text-sm" aria-label="Rate-up Nikke">
        <h3 class="font-semibold">
          <FieldLabel icon="i-ph-star-duotone">Rate-up</FieldLabel>
        </h3>
        <NikkePicker
          single
          :nikkes="store.pool"
          :model-value="store.entry.rateUpName ? [store.entry.rateUpName] : []"
          @update:model-value="store.setRateUpName($event[0] ?? '')"
        />
      </section>

      <div class="flex flex-wrap gap-3">
        <div class="flex flex-col gap-1 text-sm">
          <label for="event-gems"
            ><FieldLabel icon="i-ph-diamond-duotone">Gems (multiple of 300)</FieldLabel></label
          >
          <input
            id="event-gems"
            v-model="store.entry.gems"
            type="text"
            inputmode="numeric"
            autocomplete="off"
            class="focus rule-ink paper min-h-11 w-28 border px-2"
          />
        </div>
        <div class="flex flex-col gap-1 text-sm">
          <label for="event-tix"
            ><FieldLabel icon="i-ph-ticket-duotone">Tix (vouchers)</FieldLabel></label
          >
          <input
            id="event-tix"
            v-model="store.entry.tix"
            type="text"
            inputmode="numeric"
            autocomplete="off"
            aria-describedby="event-pulls-hint"
            class="focus rule-ink paper min-h-11 w-28 border px-2"
          />
        </div>
      </div>
      <p id="event-pulls-hint" class="ink-soft text-sm" aria-live="polite">
        {{ pullsHint(store.entry) }}
      </p>

      <section class="flex flex-col gap-1 text-sm" aria-label="SSR pulled">
        <h3 class="font-semibold">
          <FieldLabel icon="i-ph-sparkle-duotone">SSR pulled</FieldLabel>
        </h3>
        <NikkePicker
          :nikkes="store.listPool"
          :model-value="store.entry.names"
          :pinned="store.entry.rateUpName"
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
