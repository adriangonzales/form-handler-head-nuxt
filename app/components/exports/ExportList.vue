<script setup lang="ts">
import type { FormEntryExport } from '#shared/types/models'

/** A compact list of exports, newest first, for the Exports popover on a form's Entries tab. */
defineProps<{
  exports: readonly FormEntryExport[]
  /** The export whose action is running. */
  busy?: string
}>()

const emit = defineEmits<{
  download: [entryExport: FormEntryExport]
  retry: [entryExport: FormEntryExport]
}>()
</script>

<template>
  <ul class="divide-y divide-default">
    <li
      v-for="entryExport in exports"
      :key="entryExport.id"
      class="flex items-center gap-3 py-3"
      :aria-label="`Export requested ${entryExport.created_at ?? ''}`"
    >
      <div class="min-w-0 flex-1 space-y-1">
        <p class="truncate text-sm font-medium text-highlighted">
          {{ summariseParameters(entryExport.parameters) }}
        </p>
        <p class="flex flex-wrap items-center gap-x-2 text-xs text-muted">
          <RelativeTime :datetime="entryExport.created_at" />
          <span aria-hidden="true">·</span>
          <span> Expires <NuxtTime :datetime="entryExport.expires_at" relative /> </span>
        </p>
        <p v-if="entryExport.status === 'failed' && entryExport.error" class="text-xs text-error">
          {{ entryExport.error }}
        </p>
      </div>
      <ExportsExportStatus :entry-export="entryExport" class="shrink-0 text-sm" />
      <ExportsExportActions
        :entry-export="entryExport"
        :busy="busy === entryExport.id"
        @download="emit('download', entryExport)"
        @retry="emit('retry', entryExport)"
      />
    </li>
  </ul>
</template>
