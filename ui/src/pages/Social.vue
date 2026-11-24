<script setup lang="ts">
import { computed, onMounted } from 'vue'

import NikkePicker from '@/components/nikke/NikkePicker.vue'
import { useSocialStore } from '@/stores/socialStore'

const store = useSocialStore()

onMounted(() => store.load())

// Social pulls cost 10 social points each, so the pull count doubles as a points check.
const pointsHint = computed(() => {
  const n = store.row?.[1]
  return typeof n === 'number'
    ? `${n} pulls = ${n * 10} social points`
    : '1 pull = 10 social points'
})
</script>

<template>
  <div class="mx-auto flex max-w-xl flex-col gap-4 px-4 pb-24">
    <h2 class="page-title pt-4">Social</h2>

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
        <div class="flex flex-col gap-1 text-sm">
          <label for="social-times">Times (pulls)</label>
          <input
            id="social-times"
            v-model="store.entry.times"
            type="text"
            inputmode="numeric"
            autocomplete="off"
            aria-describedby="social-times-hint"
            class="focus rule-ink paper min-h-11 w-24 border px-2"
          />
          <span id="social-times-hint" class="ink-soft" aria-live="polite">{{ pointsHint }}</span>
        </div>
      </div>

      <NikkePicker
        :nikkes="store.ssrNikkes"
        :model-value="store.entry.names"
        @update:model-value="store.entry.names = $event"
      />
      <p class="text-sm" aria-live="polite">SSR: {{ store.entry.names.length }}</p>

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
