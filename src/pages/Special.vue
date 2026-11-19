<script setup lang="ts">
// Display only: Special is frozen for good, so this page never reads or writes the sheet.
const fields = [
  { label: 'Date', type: 'date' },
  { label: 'Boss', type: 'text' },
  { label: 'T9 equipment', type: 'number' },
  { label: 'Modules', type: 'number' },
  { label: 'T9 manufacturer', type: 'number' },
  { label: 'Empty', type: 'number' },
]
</script>

<template>
  <main class="mx-auto flex max-w-xl flex-col px-4 pb-24">
    <div class="py-4">
      <h2 class="text-xl font-bold">Special</h2>
    </div>

    <p role="note" class="rule-ink mb-4 border px-3 py-2 text-sm">
      Frozen. Special Interception isn't farmed any more: since August 2024 interception farming is
      Anomaly. History stays in the <code>Special</code> tab.
    </p>

    <fieldset disabled class="flex flex-col gap-3 opacity-60">
      <legend class="sr-only">Special Interception (frozen)</legend>
      <label v-for="f in fields" :key="f.label" class="flex min-h-11 items-center gap-3 text-sm">
        <span class="w-36">{{ f.label }}</span>
        <input :type="f.type" class="rule-ink paper min-h-11 flex-1 border px-2" />
      </label>
    </fieldset>

    <div class="paper rule fixed inset-x-0 bottom-0 border-t px-4 py-3">
      <button
        type="button"
        disabled
        class="bg-charcoal text-cream dark:bg-cream dark:text-charcoal mx-auto block min-h-12 w-full max-w-xl font-semibold opacity-40"
      >
        Frozen
      </button>
    </div>
  </main>
</template>
