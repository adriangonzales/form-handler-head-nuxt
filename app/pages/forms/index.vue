<script setup lang="ts">
import type { FormListItem, Paginated } from '#shared/types/models'

useSeoMeta({ title: 'Forms · Form Handler' })

// Placeholder until milestone 3. Loading the count through the proxy during SSR exercises the
// whole session → token → API path.
const { $api } = useNuxtApp()
const { data, error } = await useAsyncData('forms-count', () =>
  $api<Paginated<FormListItem>>('/v1/forms', { query: { per_page: 1 } }),
)
</script>

<template>
  <UDashboardPanel id="forms">
    <template #header>
      <UDashboardNavbar title="Forms">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UAlert
        v-if="error"
        :title="toApiError(error).message"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
      />
      <UEmpty
        v-else
        icon="i-lucide-file-text"
        :title="`You have ${data?.meta.total ?? 0} ${data?.meta.total === 1 ? 'form' : 'forms'}`"
        description="Managing forms arrives in milestone 3."
      />
    </template>
  </UDashboardPanel>
</template>
