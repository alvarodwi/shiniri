<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { hasMore, useLogStore } from '@/stores/logStore'

const store = useLogStore()
const activeName = ref(store.sections[0].name)
const active = computed(() => store.sections.find((s) => s.name === activeName.value)!)
const sentinel = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null

function select(name: string) {
  activeName.value = name
  store.open(name)
}

// Arrow keys move between tabs; only the active tab is in the tab order.
function onTabKey(e: KeyboardEvent) {
  const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
  if (!step) return
  const names = store.sections.map((s) => s.name)
  const next = names[(names.indexOf(activeName.value) + step + names.length) % names.length]
  select(next)
  document.getElementById(`log-tab-${next}`)?.focus()
}

// A failed first read has nothing loaded yet, so Retry opens instead of paging.
const retry = () =>
  active.value.loaded ? store.more(active.value.name) : store.open(active.value.name)

function refresh() {
  store.reset()
  store.open(activeName.value)
}

// Observing again makes the browser report the current visibility, so a sentinel that is still on
// screen after a chunk lands loads the next chunk too. A failed chunk waits for Retry instead.
function rearm() {
  observer?.disconnect()
  if (sentinel.value && !active.value.busy && !active.value.error) observer?.observe(sentinel.value)
}

onMounted(() => {
  observer = new IntersectionObserver(([e]) => {
    if (e?.isIntersecting) store.more(activeName.value)
  })
  store.open(activeName.value)
  watch([sentinel, () => active.value.busy, () => active.value.error], () => nextTick(rearm), {
    immediate: true,
  })
})
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <main class="mx-auto flex max-w-xl flex-col px-4 pb-12" :aria-busy="active.busy">
    <div class="flex items-center gap-3 py-4">
      <h2 class="page-title">Log</h2>
      <button
        type="button"
        class="focus press rule-ink ml-auto min-h-11 border px-3 text-sm"
        :disabled="active.busy"
        @click="refresh"
      >
        {{ active.busy && !active.loaded ? 'Reading…' : 'Refresh' }}
      </button>
    </div>
    <div role="tablist" aria-label="Audit log" class="rule flex gap-x-3 border-b">
      <button
        v-for="s in store.sections"
        :id="`log-tab-${s.name}`"
        :key="s.name"
        type="button"
        role="tab"
        :aria-selected="s.name === activeName"
        :tabindex="s.name === activeName ? 0 : -1"
        aria-controls="log-panel"
        class="focus flex min-h-11 items-center px-1 text-sm"
        :class="s.name === activeName ? 'ink font-semibold underline' : 'ink-soft'"
        @click="select(s.name)"
        @keydown="onTabKey"
      >
        {{ s.name }}
      </button>
    </div>
    <p class="sr-only" aria-live="polite">
      {{ active.busy ? `Reading the ${active.name} audit log` : '' }}
    </p>

    <section id="log-panel" role="tabpanel" :aria-labelledby="`log-tab-${activeName}`" class="py-2">
      <p v-if="active.busy && !active.loaded" class="ink-soft py-8">Reading the audit log…</p>
      <p v-if="active.error" role="alert" class="text-accent-ink py-2">
        {{ active.error }}
        <button
          type="button"
          class="focus press rule-ink ml-2 min-h-11 border px-3 text-sm"
          @click="retry"
        >
          Retry
        </button>
      </p>
      <p v-else-if="active.loaded && !active.entries.length" class="ink-soft py-2 text-sm">
        No saves yet.
      </p>
      <ol v-if="active.entries.length">
        <li
          v-for="(entry, i) in active.entries"
          :key="i"
          class="rule flex flex-col gap-1 border-b py-3"
        >
          <span>
            {{ entry.savedAt }} · <span class="font-semibold">{{ entry.form }}</span> ·
            {{ entry.rows }} {{ entry.rows === '1' ? 'row' : 'rows' }}
          </span>
          <span class="ink-soft text-sm break-all">{{ entry.ranges }}</span>
        </li>
      </ol>
      <p v-if="active.busy && active.loaded" class="ink-soft py-3 text-sm">Reading…</p>
      <div v-if="hasMore(active)" ref="sentinel" class="h-1" aria-hidden="true"></div>
    </section>
  </main>
</template>
