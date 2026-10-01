<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()

const content = computed(() => {
  switch (props.error.statusCode) {
    case 403:
      return { title: "You don't have access to this", icon: 'i-lucide-lock' }
    case 404:
      return { title: 'Not found', icon: 'i-lucide-search-x' }
    default:
      return { title: 'Something went wrong', icon: 'i-lucide-triangle-alert' }
  }
})

useSeoMeta({ title: `${content.value.title} · Form Handler` })
</script>

<template>
  <UApp>
    <div class="flex min-h-dvh items-center justify-center px-4">
      <UEmpty
        :icon="content.icon"
        :title="content.title"
        :description="
          error.statusCode === 404 || error.statusCode === 403 ? undefined : error.message
        "
        :actions="[
          {
            label: 'Back to forms',
            icon: 'i-lucide-arrow-left',
            onClick: () => clearError({ redirect: '/forms' }),
          },
        ]"
      />
    </div>
  </UApp>
</template>
