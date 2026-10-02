<script setup lang="ts">
import type { FormEntryExport } from '#shared/types/models'

/** An export's status: in progress, its row count once ready, or its error. */
const props = defineProps<{ entryExport: FormEntryExport }>()

const status = computed(
  () =>
    exportStatuses[props.entryExport.status as keyof typeof exportStatuses] ?? {
      label: props.entryExport.status,
      color: 'neutral' as const,
    },
)
</script>

<template>
  <span class="inline-flex items-center gap-2">
    <UBadge
      v-if="isInProgress(entryExport)"
      :label="status.label"
      :color="status.color"
      variant="subtle"
      icon="i-lucide-loader-circle"
      :ui="{ leadingIcon: 'animate-spin' }"
    />
    <span v-else-if="entryExport.status === 'completed'" class="text-highlighted tabular-nums">
      {{ entriesLabel(entryExport.row_count ?? 0) }}
    </span>
    <UTooltip v-else-if="entryExport.status === 'failed'" :text="entryExport.error ?? undefined">
      <UBadge label="Failed" color="error" variant="subtle" icon="i-lucide-circle-alert" />
    </UTooltip>
    <UBadge v-else :label="status.label" :color="status.color" variant="subtle" />
  </span>
</template>
