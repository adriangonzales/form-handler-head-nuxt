<script setup lang="ts">
import type { DropdownMenuItem, NavigationMenuItem } from '@nuxt/ui'

const { user } = useUserSession()
const colorMode = useColorMode()

const navigation: NavigationMenuItem[] = [
  { label: 'Forms', icon: 'i-lucide-file-text', to: '/forms' },
  { label: 'Exports', icon: 'i-lucide-download', to: '/exports' },
  { label: 'Account', icon: 'i-lucide-user', to: '/account' },
]

const userMenu = computed<DropdownMenuItem[][]>(() => [
  [{ label: user.value?.email ?? '', type: 'label' }],
  [
    {
      label: colorMode.value === 'dark' ? 'Light mode' : 'Dark mode',
      icon: colorMode.value === 'dark' ? 'i-lucide-sun' : 'i-lucide-moon',
      onSelect: () => {
        colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
      },
    },
    { label: 'Account', icon: 'i-lucide-user', to: '/account' },
  ],
  [{ label: 'Log out', icon: 'i-lucide-log-out', onSelect: () => signOut() }],
])
</script>

<template>
  <UDashboardGroup>
    <UDashboardSidebar collapsible :ui="{ footer: 'border-t border-default' }">
      <template #header="{ collapsed }">
        <NuxtLink to="/forms" class="flex items-center gap-2 font-semibold text-highlighted">
          <UIcon name="i-lucide-inbox" class="size-5 shrink-0 text-primary" />
          <span v-if="!collapsed">Form Handler</span>
        </NuxtLink>
      </template>

      <template #default="{ collapsed }">
        <UNavigationMenu :collapsed="collapsed" :items="navigation" orientation="vertical" />
      </template>

      <template #footer="{ collapsed }">
        <UDropdownMenu :items="userMenu" :content="{ align: 'start' }" class="w-full">
          <UButton
            :label="collapsed ? undefined : user?.name"
            :aria-label="collapsed ? `Account menu for ${user?.name}` : undefined"
            icon="i-lucide-circle-user"
            color="neutral"
            variant="ghost"
            block
            :square="collapsed"
            class="justify-start"
          />
        </UDropdownMenu>
      </template>
    </UDashboardSidebar>

    <slot />
  </UDashboardGroup>
</template>
