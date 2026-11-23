<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import EventPage from '@/pages/Event.vue'
import MoldsPage from '@/pages/Molds.vue'
import OrdinaryPage from '@/pages/Ordinary.vue'
import OtherPage from '@/pages/Other.vue'
import Social from '@/pages/Social.vue'
import SpareBodyPage from '@/pages/SpareBody.vue'
import {
  PULL_FORMS,
  allowSwitch,
  parseForm,
  readLastForm,
  rememberForm,
} from '@/services/gacha/pullForms'
import type { PullFormKey } from '@/services/gacha/pullForms'
import { useEventStore } from '@/stores/eventStore'
import { useMoldsStore } from '@/stores/moldsStore'
import { useOrdinaryStore } from '@/stores/ordinaryStore'
import { useOtherStore } from '@/stores/otherStore'
import { useSocialStore } from '@/stores/socialStore'
import { useSpareBodyStore } from '@/stores/spareBodyStore'

const pages = {
  social: Social,
  event: EventPage,
  ordinary: OrdinaryPage,
  mold: MoldsPage,
  exchange: SpareBodyPage,
  extra: OtherPage,
}
const stores = {
  social: useSocialStore(),
  event: useEventStore(),
  ordinary: useOrdinaryStore(),
  mold: useMoldsStore(),
  exchange: useSpareBodyStore(),
  extra: useOtherStore(),
}

const route = useRoute()
const router = useRouter()
// An old bookmark (/#/mold) arrives as ?form=mold: open that form once, then drop the query so a
// reload goes back to the remembered one.
const fromBookmark = parseForm(route.query.form)
const current = ref<PullFormKey>(fromBookmark ?? readLastForm())
if (fromBookmark) {
  rememberForm(fromBookmark)
  router.replace({ query: {} })
}

function onChange(e: Event) {
  const select = e.target as HTMLSelectElement
  const leaving = stores[current.value]
  if (allowSwitch(leaving.isDirty, (m) => window.confirm(m))) {
    leaving.discard() // confirmed: the old input must not come back, or Save would write it
    current.value = select.value as PullFormKey
    rememberForm(current.value)
  } else {
    select.value = current.value
  }
}
</script>

<template>
  <main>
    <div class="mx-auto flex max-w-xl px-4 pt-4">
      <label class="flex items-center gap-3 text-sm">
        Form
        <select
          :value="current"
          class="focus rule-ink paper min-h-11 border px-2"
          @change="onChange"
        >
          <option v-for="f in PULL_FORMS" :key="f.key" :value="f.key">{{ f.label }}</option>
        </select>
      </label>
    </div>
    <KeepAlive>
      <component :is="pages[current]" />
    </KeepAlive>
  </main>
</template>
