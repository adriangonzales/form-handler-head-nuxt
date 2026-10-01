<script setup lang="ts">
useSeoMeta({ title: 'Exports · Form Handler' })
</script>

<template>
  <UDashboardPanel id="exports">
    <template #header>
      <UDashboardNavbar title="Exports">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UEmpty
        icon="i-lucide-download"
        title="Exports"
        description="Recent CSV exports arrive in milestone 6."
      />
    </template>
  </UDashboardPanel>
</template>
