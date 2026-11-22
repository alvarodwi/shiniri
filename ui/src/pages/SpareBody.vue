<script setup lang="ts">
import { onMounted } from 'vue'

import NikkePicker from '@/components/nikke/NikkePicker.vue'
import { MAX_COPIES } from '@/config/limits'
import { useSpareBodyStore } from '@/stores/spareBodyStore'
import { SPARE_SOURCES } from '@/types/spareBody'

const store = useSpareBodyStore()

onMounted(() => store.load())
</script>

<template>
  <main class="mx-auto flex max-w-xl flex-col gap-4 px-4 pb-24">
    <h2 class="pt-4 text-xl font-bold">Exchange</h2>

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

      <div role="group" aria-label="Source" class="flex flex-wrap gap-2 text-sm">
        <button
          v-for="s in SPARE_SOURCES"
          :key="s"
          type="button"
          :aria-pressed="store.entry.source === s"
          class="focus press rule-ink paper min-h-11 border px-3 aria-pressed:font-semibold aria-pressed:underline"
          @click="store.setSource(s)"
        >
          {{ s }}
        </button>
      </div>

      <section class="flex flex-col gap-1 text-sm" aria-label="Target">
        <h3 class="font-semibold">Target</h3>
        <NikkePicker
          v-if="store.entry.source"
          single
          :nikkes="store.pool"
          :model-value="store.entry.target ? [store.entry.target] : []"
          @update:model-value="store.entry.target = $event[0] ?? ''"
        />
        <p v-else class="ink-soft">Pick a source first.</p>
      </section>

      <div class="flex flex-col gap-1 text-sm">
        <label for="sparebody-copies">Copies</label>
        <input
          id="sparebody-copies"
          aria-describedby="sparebody-copies-hint"
          v-model="store.entry.copies"
          type="text"
          inputmode="numeric"
          autocomplete="off"
          class="focus rule-ink paper min-h-11 w-28 border px-2"
        />
        <p id="sparebody-copies-hint" class="ink-soft">
          1 to {{ MAX_COPIES }} copies, one row each.
        </p>
      </div>

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
    <p v-if="store.remark" role="status" class="py-1">{{ store.remark }}</p>

    <div class="paper rule fixed inset-x-0 bottom-0 border-t px-4 py-3">
      <button
        type="button"
        class="focus press bg-charcoal text-cream dark:bg-cream dark:text-charcoal mx-auto block min-h-12 w-full max-w-xl font-semibold disabled:opacity-40"
        :disabled="!store.canSave"
        @click="store.save()"
      >
        {{ store.status === 'saving' ? 'Saving…' : 'Save' }}
      </button>
    </div>
  </main>
</template>
