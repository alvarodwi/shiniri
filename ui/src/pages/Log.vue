<script setup lang="ts">
import { onMounted } from 'vue'

import { useLogStore } from '@/stores/logStore'

const store = useLogStore()

onMounted(() => store.load())
</script>

<template>
  <main class="mx-auto flex max-w-xl flex-col px-4 pb-12" :aria-busy="store.status === 'loading'">
    <div class="flex items-center gap-3 py-4">
      <h2 class="text-xl font-bold">Log</h2>
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
      {{ store.status === 'loading' ? 'Reading the audit logs' : '' }}
    </p>

    <p v-if="store.status === 'loading' && !store.sections.length" class="ink-soft py-8">
      Reading the audit logs…
    </p>

    <section
      v-for="section in store.sections"
      :key="section.name"
      :aria-label="section.name"
      class="py-2"
    >
      <h3 class="font-semibold">{{ section.name }}</h3>
      <p v-if="section.error" role="alert" class="text-accent-ink py-2">{{ section.error }}</p>
      <p v-else-if="!section.entries.length" class="ink-soft py-2 text-sm">No saves yet.</p>
      <ol v-else>
        <li
          v-for="(entry, i) in section.entries"
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
    </section>
  </main>
</template>
