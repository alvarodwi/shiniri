<script setup lang="ts">
import { computed, onMounted } from 'vue'

import NikkePicker from '@/components/nikke/NikkePicker.vue'
import { monthOf, validIdr, validUsd } from '@/services/spending/spendingRows'
import { useSpendingStore } from '@/stores/spendingStore'
import { MONTHLY, MONTHS, PLATFORMS, SPENDING_TYPES } from '@/types/spending'

const store = useSpendingStore()

onMounted(() => store.load())

const type = computed(() => store.entry.type)
const bySsr = computed(() =>
  ['Mission Pass', 'Event Pass', 'Costume Gacha', 'Costume'].includes(type.value),
)
const byMonth = computed(() => ['Mission Pass', 'Event Pass'].includes(type.value))
const byName = computed(() => ['Campaign Pass', 'Music Pack'].includes(type.value))
// Typed but unusable prices say why Save stays off; a blank one needs no hint.
const badIdr = computed(() => !!store.entry.priceIdr.trim() && !validIdr(store.entry.priceIdr))
const badUsd = computed(() => !!store.entry.priceUsd.trim() && !validUsd(store.entry.priceUsd))
</script>

<template>
  <main class="mx-auto flex max-w-xl flex-col gap-4 px-4 pb-24">
    <h2 class="page-title pt-4">Spending</h2>

    <!-- Only the first read hides the form; a reload after Save keeps it mounted, so focus stays. -->
    <p v-if="store.status === 'loading' && !store.nikkes.length" class="ink-soft py-8">
      Reading the sheet…
    </p>
    <template v-else>
      <button
        type="button"
        class="focus press rule-ink paper min-h-11 self-start border px-3 text-sm"
        @click="store.quickMonthly()"
      >
        + {{ MONTHLY }}
      </button>

      <label class="flex flex-col gap-1 self-start text-sm">
        Purchase date
        <input
          v-model="store.entry.date"
          type="date"
          class="focus rule-ink paper min-h-11 border px-2"
        />
      </label>

      <div role="group" aria-label="Type" class="flex flex-wrap gap-2 text-sm">
        <button
          v-for="t in SPENDING_TYPES"
          :key="t"
          type="button"
          :aria-pressed="type === t"
          class="focus press rule-ink paper min-h-11 border px-3 aria-pressed:font-semibold aria-pressed:underline"
          @click="store.setType(t)"
        >
          {{ t }}
        </button>
      </div>

      <template v-if="type">
        <section v-if="bySsr" class="flex flex-col gap-1 text-sm" aria-label="SSR">
          <h3 class="font-semibold">SSR</h3>
          <NikkePicker
            single
            :nikkes="store.pool"
            :model-value="store.entry.ssr ? [store.entry.ssr] : []"
            @update:model-value="store.entry.ssr = $event[0] ?? ''"
          />
        </section>

        <label v-if="byMonth" class="flex flex-col gap-1 self-start text-sm">
          Month
          <select v-model="store.entry.month" class="focus rule-ink paper min-h-11 border px-2">
            <option value="">From date ({{ monthOf(store.entry.date) || 'none' }})</option>
            <option v-for="m in MONTHS" :key="m" :value="m">{{ m }}</option>
          </select>
        </label>

        <div v-if="byName" class="flex flex-col gap-1 text-sm">
          <label for="spending-name">Package name</label>
          <input
            id="spending-name"
            v-model="store.entry.name"
            type="text"
            list="spending-names"
            autocomplete="off"
            class="focus rule-ink paper min-h-11 border px-2"
          />
          <datalist id="spending-names">
            <option v-for="n in store.pastNames" :key="n" :value="n" />
          </datalist>
        </div>

        <div class="flex flex-wrap gap-3 text-sm">
          <div class="flex flex-col gap-1">
            <label for="spending-idr">Price (IDR)</label>
            <input
              id="spending-idr"
              v-model="store.entry.priceIdr"
              type="text"
              inputmode="numeric"
              autocomplete="off"
              placeholder="79000"
              :aria-invalid="badIdr"
              aria-describedby="spending-idr-hint"
              class="focus rule-ink paper min-h-11 w-32 border px-2"
            />
            <span v-if="badIdr" id="spending-idr-hint" class="text-accent-ink text-xs">
              Whole rupiah, no dots or commas
            </span>
          </div>
          <div class="flex flex-col gap-1">
            <label for="spending-usd">Price (USD)</label>
            <input
              id="spending-usd"
              v-model="store.entry.priceUsd"
              type="text"
              inputmode="decimal"
              autocomplete="off"
              placeholder="4.99"
              :aria-invalid="badUsd"
              aria-describedby="spending-usd-hint"
              class="focus rule-ink paper min-h-11 w-28 border px-2"
            />
            <span v-if="badUsd" id="spending-usd-hint" class="text-accent-ink text-xs">
              Like 4.99, dot for cents
            </span>
          </div>
        </div>

        <div role="group" aria-label="Platform" class="flex flex-wrap gap-2 text-sm">
          <button
            v-for="p in PLATFORMS"
            :key="p"
            type="button"
            :aria-pressed="store.platform === p"
            class="focus press rule-ink paper min-h-11 border px-3 aria-pressed:font-semibold aria-pressed:underline"
            @click="store.entry.platform = p"
          >
            {{ p }}
          </button>
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

        <p class="text-sm"><span class="ink-soft">Package:</span> {{ store.name || '…' }}</p>
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

    <div class="savebar">
      <button type="button" class="btn-save" :disabled="!store.canSave" @click="store.save()">
        {{ store.status === 'saving' ? 'Saving…' : 'Save' }}
      </button>
    </div>
  </main>
</template>
