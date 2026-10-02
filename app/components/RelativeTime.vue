<script setup lang="ts">
/** A relative time ("3 hours ago") with the full local date and time in a tooltip. */
const props = defineProps<{ datetime: string | null | undefined }>()

const full = computed(() =>
  props.datetime
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(props.datetime),
      )
    : '',
)
</script>

<template>
  <UTooltip v-if="datetime" :text="full">
    <NuxtTime :datetime="datetime" relative class="whitespace-nowrap" />
  </UTooltip>
  <span v-else class="text-muted">—</span>
</template>
