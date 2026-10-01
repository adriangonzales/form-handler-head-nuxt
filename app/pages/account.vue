<script setup lang="ts">
useSeoMeta({ title: 'Account · Form Handler' })

const { user } = useUserSession()
</script>

<template>
  <UDashboardPanel id="account">
    <template #header>
      <UDashboardNavbar title="Account">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UEmpty
        icon="i-lucide-user"
        :title="user?.name"
        :description="`Signed in as ${user?.email}. Profile and password settings arrive in milestone 8.`"
      />
    </template>
  </UDashboardPanel>
</template>
