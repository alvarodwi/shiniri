<script setup lang="ts">
import { computed, ref } from 'vue'

// Buttons for a short list; over about 12, a search box above a two-column scrolling grid.
const props = defineProps<{ options: string[]; label: string; selected?: string }>()
const emit = defineEmits<{ pick: [option: string] }>()

const long = computed(() => props.options.length > 12)
const query = ref('')
const matches = computed(() => {
  const q = query.value.trim().toLowerCase()
  return long.value && q ? props.options.filter((o) => o.toLowerCase().includes(q)) : props.options
})
// Enter picks the first match of a typed search. Enter that confirms IME input is left alone.
function onEnter(e: KeyboardEvent) {
  if (!e.isComposing && query.value.trim() && matches.value.length) emit('pick', matches.value[0])
}
</script>

<template>
  <input
    v-if="long"
    v-model="query"
    type="search"
    autocomplete="off"
    class="focus rule-ink paper min-h-11 w-full shrink-0 border px-2"
    :placeholder="`Search ${options.length} ${label}`"
    :aria-label="`Search ${label}`"
    @keydown.enter="onEnter"
    @keydown.esc="query && $event.stopPropagation()"
  />
  <div
    :class="
      long
        ? 'grid max-h-60 shrink-0 grid-cols-2 content-start gap-2 overflow-y-auto p-1'
        : 'contents'
    "
  >
    <button
      v-for="o in matches"
      :key="o"
      type="button"
      class="btn-line text-left"
      :class="o === selected && 'tap-on'"
      :aria-pressed="selected === undefined ? undefined : o === selected"
      @click="emit('pick', o)"
    >
      {{ o }}
    </button>
  </div>
  <p v-if="!matches.length" class="ink-soft text-sm">No match.</p>
</template>
