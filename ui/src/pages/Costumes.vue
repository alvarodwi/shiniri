<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

import { costumeImage, ownedNewestFirst, searchOwned } from '@/services/costume/costumeDatabase'
import { useCostumeStore } from '@/stores/costumeStore'

const BATCH = 24
const store = useCostumeStore()

const query = ref('')
const visible = ref(BATCH)
const results = computed(() => searchOwned(store.costumes, query.value))
const ownedCount = computed(() => ownedNewestFirst(store.costumes).length)
const shown = computed(() => results.value.slice(0, visible.value))
// Images whose file is missing; the fallback tile shows instead of a broken image.
const broken = ref(new Set<string>())

watch(query, () => (visible.value = BATCH))

// One batch more each time the sentinel below the grid scrolls into view. Re-observing after a batch
// makes the observer report again, in case the sentinel is still on screen.
const sentinel = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null

function more(entries: IntersectionObserverEntry[]) {
  const el = sentinel.value
  if (!el || !entries.some((e) => e.isIntersecting) || visible.value >= results.value.length) return
  visible.value += BATCH
  observer?.unobserve(el)
  nextTick(() => sentinel.value && observer?.observe(sentinel.value))
}

watch(sentinel, (el, old) => {
  if (old) observer?.unobserve(old)
  if (el) observer?.observe(el)
})

onMounted(() => {
  observer = new IntersectionObserver(more)
  if (sentinel.value) observer.observe(sentinel.value)
  store.load()
})
onUnmounted(() => observer?.disconnect())
</script>

<template>
  <main class="mx-auto flex max-w-xl flex-col px-4 pb-12" :aria-busy="store.status === 'loading'">
    <div class="flex items-center gap-3 py-4">
      <h2 class="text-xl font-bold">Costumes</h2>
      <button
        type="button"
        class="focus press rule-ink ml-auto min-h-11 border px-3 text-sm"
        :disabled="store.status === 'loading'"
        @click="store.load()"
      >
        {{ store.status === 'loading' ? 'Reading…' : 'Refresh' }}
      </button>
    </div>
    <p class="sr-only" aria-live="polite">
      {{ store.status === 'loading' ? 'Reading the costumes' : '' }}
    </p>

    <p v-if="store.error" role="alert" class="text-accent-ink py-2">{{ store.error }}</p>
    <p v-if="store.status === 'loading' && !store.costumes.length" class="ink-soft py-8">
      Reading the costumes…
    </p>

    <!-- A failed refresh keeps showing the costumes already read -->
    <template v-else-if="!store.error || store.costumes.length">
      <label class="flex flex-col gap-1 text-sm">
        <span class="ink-soft">Search</span>
        <input
          v-model="query"
          type="search"
          placeholder="nikke or costume…"
          class="focus rule-ink paper min-h-11 border px-3"
        />
      </label>
      <p class="ink-soft py-2 text-sm">{{ ownedCount }} owned</p>

      <p v-if="!ownedCount" class="ink-soft py-8">No owned costumes yet.</p>
      <p v-else-if="!results.length" class="ink-soft py-8">No match.</p>
      <ul v-else class="grid grid-cols-2 gap-3">
        <li v-for="c in shown" :key="c.costumeId" class="rule flex flex-col border">
          <img
            v-if="costumeImage(c.image) && !broken.has(c.costumeId)"
            :src="costumeImage(c.image)!"
            alt=""
            loading="lazy"
            class="aspect-square w-full object-cover"
            @error="broken.add(c.costumeId)"
          />
          <span
            v-else
            class="rule-ink ink-soft flex aspect-square w-full items-center justify-center border text-3xl"
          >
            {{ (c.costumeName || c.nikke).charAt(0) }}
          </span>
          <span class="flex flex-col gap-0.5 p-2 text-sm">
            <span class="font-semibold">{{ c.nikke }}</span>
            <span>{{ c.costumeName }}</span>
            <span v-if="c.releaseDate" class="ink-soft text-xs">{{ c.releaseDate }}</span>
          </span>
        </li>
      </ul>
      <div ref="sentinel" class="h-px" aria-hidden="true" />
    </template>
  </main>
</template>
