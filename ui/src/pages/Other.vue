<script setup lang="ts">
import { onMounted } from 'vue'

import NikkePicker from '@/components/nikke/NikkePicker.vue'
import { MAX_COPIES } from '@/config/limits'
import { useOtherStore } from '@/stores/otherStore'
import { FREE_PULLS, GUARANTEED, OTHER_TYPES } from '@/types/other'

const store = useOtherStore()

onMounted(() => store.load())
</script>

<template>
  <div class="mx-auto flex max-w-xl flex-col gap-4 px-4 pb-24">
    <h2 class="page-title pt-4">Extra</h2>

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

      <div role="group" aria-label="Type" class="flex flex-wrap gap-2 text-sm">
        <button
          v-for="t in OTHER_TYPES"
          :key="t"
          type="button"
          :aria-pressed="store.entry.sourceType === t"
          class="focus press rule-ink paper min-h-11 border px-3 aria-pressed:font-semibold aria-pressed:underline"
          @click="store.setSourceType(t)"
        >
          {{ t }}
        </button>
      </div>

      <template v-if="store.entry.sourceType">
        <div v-if="store.entry.sourceType !== FREE_PULLS" class="flex flex-col gap-1 text-sm">
          <label for="other-info">Info</label>
          <input
            id="other-info"
            v-model="store.entry.sourceInfo"
            type="text"
            placeholder="3.5 Anniv, Step Up 2026, Tutorial"
            autocomplete="off"
            class="focus rule-ink paper min-h-11 border px-2"
          />
        </div>

        <section
          v-if="store.entry.sourceType === FREE_PULLS"
          class="flex flex-col gap-1 text-sm"
          aria-label="Rate-up"
        >
          <h3 class="font-semibold">Rate-up</h3>
          <NikkePicker
            single
            :nikkes="store.pool"
            :model-value="store.entry.rateUpName ? [store.entry.rateUpName] : []"
            @update:model-value="store.entry.rateUpName = $event[0] ?? ''"
          />
        </section>

        <template v-if="store.entry.sourceType === GUARANTEED">
          <div class="flex flex-wrap gap-3 text-sm">
            <div class="flex flex-col gap-1">
              <label for="other-gems">Gems</label>
              <input
                id="other-gems"
                v-model="store.entry.gems"
                type="text"
                inputmode="numeric"
                autocomplete="off"
                placeholder="Optional"
                class="focus rule-ink paper min-h-11 w-28 border px-2"
              />
            </div>
            <div class="flex flex-col gap-1">
              <label for="other-times">Times</label>
              <input
                id="other-times"
                v-model="store.entry.times"
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
            <p aria-live="polite">SSR: {{ store.entry.names.length }}</p>
          </section>
        </template>
        <template v-else>
          <section class="flex flex-col gap-1 text-sm" aria-label="Nikke">
            <h3 class="font-semibold">Nikke</h3>
            <NikkePicker
              single
              :nikkes="store.pool"
              :model-value="store.entry.names"
              @update:model-value="store.entry.names = $event"
            />
          </section>
          <div v-if="store.entry.sourceType !== FREE_PULLS" class="flex flex-col gap-1 text-sm">
            <label for="other-copies">Copies</label>
            <input
              id="other-copies"
              aria-describedby="other-copies-hint"
              v-model="store.entry.copies"
              type="text"
              inputmode="numeric"
              autocomplete="off"
              class="focus rule-ink paper min-h-11 w-28 border px-2"
            />
            <p id="other-copies-hint" class="ink-soft">
              1 to {{ MAX_COPIES }} copies, one row each.
            </p>
          </div>
        </template>

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
        {{ store.status === 'saving' ? 'Saving…' : 'Save' }}
      </button>
    </div>
  </div>
</template>
