<script setup lang="ts">
import type { FormEntryExport } from '#shared/types/models'

/** Download for a ready export, Try again for a failed one. */
defineProps<{ entryExport: FormEntryExport; busy?: boolean }>()

const emit = defineEmits<{ download: []; retry: [] }>()
</script>

<template>
  <UButton
    v-if="entryExport.status === 'completed'"
    label="Download"
    icon="i-lucide-download"
    color="neutral"
    variant="outline"
    size="sm"
    :loading="busy"
    :aria-label="`Download ${entryExport.filename}`"
    @click="emit('download')"
  />
  <UButton
    v-else-if="entryExport.status === 'failed'"
    label="Try again"
    icon="i-lucide-rotate-ccw"
    color="neutral"
    variant="outline"
    size="sm"
    :loading="busy"
    @click="emit('retry')"
  />
</template>
