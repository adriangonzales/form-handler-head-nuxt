<script setup lang="ts">
import type { FormEntryBulkAction } from '#shared/types/models'

/** The actions for the selected entries; which ones depends on the tab. */
const props = defineProps<{
  status: EntryStatus
  count: number
  /** The action in progress. */
  busy?: FormEntryBulkAction
}>()

const emit = defineEmits<{ run: [item: BulkActionItem]; clear: [] }>()

const actions = computed(() => bulkActionsFor(props.status))
</script>

<template>
  <div
    role="toolbar"
    aria-label="Bulk actions"
    class="flex flex-wrap items-center gap-2 rounded-md border border-default bg-elevated/50 px-3 py-2"
  >
    <span class="me-2 text-sm font-medium text-highlighted tabular-nums" aria-live="polite">
      {{ count }} selected
    </span>
    <UButton
      v-for="item in actions"
      :key="item.action"
      :label="item.label"
      :icon="item.icon"
      :color="item.destructive ? 'error' : 'neutral'"
      variant="ghost"
      size="sm"
      :loading="busy === item.action"
      :disabled="busy !== undefined"
      @click="emit('run', item)"
    />
    <UButton
      label="Clear selection"
      color="neutral"
      variant="link"
      size="sm"
      class="ms-auto"
      @click="emit('clear')"
    />
  </div>
</template>
