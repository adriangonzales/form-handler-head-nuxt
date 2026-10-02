<script setup lang="ts">
/** A confirmation dialog for destructive actions. Open it with `useOverlay()`; it closes with `true` to go ahead. */
withDefaults(
  defineProps<{
    title: string
    description?: string
    confirmLabel?: string
  }>(),
  { description: undefined, confirmLabel: 'Delete' },
)

const emit = defineEmits<{ close: [confirmed: boolean] }>()
</script>

<template>
  <UModal :title="title" :description="description" :close="false" :dismissible="true">
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton label="Cancel" color="neutral" variant="outline" @click="emit('close', false)" />
        <UButton :label="confirmLabel" color="error" autofocus @click="emit('close', true)" />
      </div>
    </template>
  </UModal>
</template>
