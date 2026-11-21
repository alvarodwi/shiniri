<script setup lang="ts">
import { computed, ref } from 'vue'

import { nikkeIcon, searchNikkes } from '@/services/nikke/nikkeDatabase'
import type { Nikke } from '@/services/nikke/nikkeDatabase'

// Names come only from the list, never free text, so rows always match NikkeDatabase. The same name
// can be picked again (a Nikke can drop twice in one session). `single` makes a pick replace the
// value, for a field that holds one name. `pinned` shows a one-tap chip for a likely pick; it is
// ignored in single mode.
const props = defineProps<{
  nikkes: Nikke[]
  modelValue: string[]
  single?: boolean
  pinned?: string
}>()
const emit = defineEmits<{ 'update:modelValue': [names: string[]] }>()

const query = ref('')
const results = computed(() => searchNikkes(props.nikkes, query.value))
// Icons whose file is missing; the fallback tile shows instead of a broken image.
const broken = ref(new Set<string>())

function pick(name: string) {
  emit('update:modelValue', props.single ? [name] : [...props.modelValue, name])
  query.value = ''
}

// Enter picks the last name standing. Enter that confirms IME input is left alone.
function onEnter(e: KeyboardEvent) {
  if (e.isComposing) return
  e.preventDefault()
  if (results.value.length === 1) pick(results.value[0].name)
}

const remove = (i: number) =>
  emit(
    'update:modelValue',
    props.modelValue.filter((_, j) => j !== i),
  )

const icon = (n: Nikke) => (broken.value.has(n.resourceId) ? null : nikkeIcon(n.resourceId))
</script>

<template>
  <div class="flex flex-col gap-2 text-sm">
    <button
      v-if="pinned && !single"
      type="button"
      class="focus press rule-ink paper min-h-11 self-start border px-3"
      @click="pick(pinned)"
    >
      + {{ pinned }}
    </button>

    <label class="flex flex-col gap-1">
      Search Nikke
      <input
        v-model="query"
        type="search"
        autocomplete="off"
        class="focus rule-ink paper min-h-11 border px-2"
        @keydown.enter="onEnter"
      />
    </label>

    <ul v-if="results.length" class="rule-ink flex flex-col border">
      <li v-for="n in results" :key="n.nameCode">
        <button
          type="button"
          class="focus press paper flex min-h-11 w-full items-center gap-3 px-2 text-left"
          @click="pick(n.name)"
        >
          <img
            v-if="icon(n)"
            :src="icon(n)!"
            alt=""
            class="size-8 shrink-0"
            @error="broken.add(n.resourceId)"
          />
          <span
            v-else
            class="rule-ink ink-soft flex size-8 shrink-0 items-center justify-center border"
          >
            {{ n.name.charAt(0) }}
          </span>
          <span class="grow">{{ n.name }}</span>
          <span class="ink-soft">{{ n.rarity }}</span>
        </button>
      </li>
    </ul>

    <ul v-if="modelValue.length" class="flex flex-wrap gap-2" aria-label="Picked Nikkes">
      <li
        v-for="(name, i) in modelValue"
        :key="i"
        class="rule-ink paper flex min-h-11 items-center gap-2 border pl-3"
      >
        {{ name }}
        <button
          type="button"
          class="focus press min-h-11 w-11"
          :aria-label="`Remove ${name}`"
          @click="remove(i)"
        >
          ×
        </button>
      </li>
    </ul>
  </div>
</template>
