<script setup lang="ts">
import { computed, onMounted } from 'vue'

import { SOLO_RAID_MAX_PLACE } from '@/config/limits'
import { parseDamage } from '@/services/soloRaid/soloRaidRows'
import { useSoloRaidStore } from '@/stores/soloRaidStore'
import { WEAKNESSES } from '@/types/soloRaid'
import type { RankMode } from '@/types/soloRaid'

const store = useSoloRaidStore()

onMounted(() => store.load())

const MODES: { mode: RankMode; label: string; hint: string }[] = [
  { mode: 'percent', label: '%', hint: 'Top %, two decimals' },
  { mode: 'place', label: '#', hint: `Placement 1-${SOLO_RAID_MAX_PLACE}` },
]

const rankHint = computed(() => MODES.find((m) => m.mode === store.entry.rankMode)!.hint)

// Echo the damage with separators, so a missing or extra digit is easy to spot.
const damageEcho = computed(() => {
  const n = parseDamage(store.entry.damage)
  return n === null ? '' : n.toLocaleString('en-US')
})

// An emptied box reads as NaN; null keeps Save disabled without a misleading number.
function setSeason(input: HTMLInputElement) {
  store.entry.season = input.value === '' ? null : Number(input.value)
}

const tap = (on: boolean) => (on ? 'tap-on' : 'rule-ink paper border')
</script>

<template>
  <main class="mx-auto flex max-w-xl flex-col gap-4 px-4 pb-24">
    <h2 class="page-title pt-4">Solo Raid</h2>

    <p v-if="store.status === 'loading'" class="ink-soft py-8">Reading the sheet…</p>
    <template v-else>
      <div class="flex flex-wrap gap-3">
        <label class="flex flex-col gap-1 text-sm">
          Season
          <input
            :value="store.entry.season ?? ''"
            type="number"
            inputmode="numeric"
            min="1"
            class="focus rule-ink paper min-h-11 w-24 border px-2"
            @input="setSeason($event.target as HTMLInputElement)"
          />
        </label>
        <label class="flex flex-col gap-1 text-sm">
          Attempt date
          <input
            v-model="store.entry.date"
            type="date"
            class="focus rule-ink paper min-h-11 border px-2"
          />
        </label>
      </div>

      <label class="flex flex-col gap-1 text-sm">
        Boss
        <input
          v-model="store.entry.boss"
          type="text"
          list="solo-raid-bosses"
          autocomplete="off"
          class="focus rule-ink paper min-h-11 border px-2"
        />
        <datalist id="solo-raid-bosses">
          <option v-for="b in store.bosses" :key="b" :value="b" />
        </datalist>
      </label>

      <fieldset class="flex flex-col gap-1 text-sm">
        <legend class="pb-1">Weakness</legend>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="w in WEAKNESSES"
            :key="w"
            type="button"
            class="focus press min-h-11 px-3"
            :class="tap(store.entry.weakness === w)"
            :aria-pressed="store.entry.weakness === w"
            @click="store.setWeakness(w)"
          >
            {{ w }}
          </button>
        </div>
      </fieldset>

      <div class="flex flex-col gap-1 text-sm">
        <label for="solo-raid-damage">Total damage</label>
        <input
          id="solo-raid-damage"
          v-model="store.entry.damage"
          type="text"
          inputmode="numeric"
          autocomplete="off"
          aria-describedby="solo-raid-damage-echo"
          class="focus rule-ink paper min-h-11 border px-2"
        />
        <!-- Kept outside the label so it isn't read as part of the field's name. -->
        <span id="solo-raid-damage-echo" class="ink-soft" aria-live="polite">{{ damageEcho }}</span>
      </div>

      <div class="flex flex-col gap-1 text-sm">
        <label for="solo-raid-rank">Rank</label>
        <div class="flex gap-2">
          <div role="group" aria-label="Rank type" class="flex">
            <button
              v-for="m in MODES"
              :key="m.mode"
              type="button"
              class="focus press min-h-11 w-11"
              :class="tap(store.entry.rankMode === m.mode)"
              :aria-pressed="store.entry.rankMode === m.mode"
              @click="store.setRankMode(m.mode)"
            >
              {{ m.label }}
            </button>
          </div>
          <input
            id="solo-raid-rank"
            v-model="store.entry.rank"
            aria-describedby="solo-raid-rank-hint"
            type="text"
            inputmode="decimal"
            autocomplete="off"
            class="focus rule-ink paper min-h-11 w-32 border px-2"
          />
        </div>
        <span id="solo-raid-rank-hint" class="ink-soft">{{ rankHint }}</span>
      </div>

      <label class="flex flex-col gap-1 text-sm">
        Comments
        <input
          v-model="store.entry.comments"
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

    <div class="savebar">
      <button type="button" class="btn-save" :disabled="!store.canSave" @click="store.save()">
        {{ store.status === 'saving' ? 'Saving…' : 'Save season' }}
      </button>
    </div>
  </main>
</template>
