<script setup lang="ts">
// An icon in front of a label. The text stays for screen readers and phones that want it;
// `hideText` drops it visually once the icon alone is clear (the owner decides per field).
defineProps<{ icon: string; hideText?: boolean }>()
</script>

<template>
  <span class="inline-flex items-center gap-1.5">
    <span class="coin" aria-hidden="true"><span :class="icon" /></span>
    <span :class="hideText ? 'sr-only' : ''"><slot /></span>
  </span>
</template>
