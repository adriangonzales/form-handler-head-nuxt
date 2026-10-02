<script setup lang="ts">
/** A read-only code sample with a copy button. */
const props = defineProps<{ code: string; label: string }>()

const copy = useCopy()
</script>

<template>
  <div class="relative">
    <UButton
      icon="i-lucide-copy"
      label="Copy"
      color="neutral"
      variant="outline"
      size="xs"
      class="absolute top-2 right-2"
      :aria-label="`Copy ${label}`"
      @click="copy(props.code, label)"
    />
    <pre
      class="max-h-96 overflow-auto rounded-md border border-default bg-elevated p-4 pr-20 font-mono text-xs/5 text-default"
      role="region"
      :aria-label="label"
      tabindex="0"
    ><code>{{ code }}</code></pre>
  </div>
</template>
