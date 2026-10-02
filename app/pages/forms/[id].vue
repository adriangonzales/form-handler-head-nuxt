<script setup lang="ts">
import type { DropdownMenuItem, NavigationMenuItem } from '@nuxt/ui'

const route = useRoute()
const toast = useToast()
const id = computed(() => String(route.params.id))

const { data: form, error } = await useFormDetail(id)

if (error.value) {
  const { status, message } = toApiError(error.value)

  throw createError({ statusCode: status || 500, statusMessage: message, fatal: true })
}

useSeoMeta({ title: () => `${form.value?.name ?? 'Form'} · Form Handler` })

const tabs = computed<NavigationMenuItem[]>(() => [
  { label: 'Entries', icon: 'i-lucide-inbox', to: `/forms/${id.value}/entries` },
  { label: 'Fields', icon: 'i-lucide-list', to: `/forms/${id.value}/fields` },
  { label: 'Settings', icon: 'i-lucide-settings', to: `/forms/${id.value}/settings` },
  { label: 'Notifications', icon: 'i-lucide-bell', to: `/forms/${id.value}/notifications` },
  { label: 'Integrate', icon: 'i-lucide-code', to: `/forms/${id.value}/integrate` },
])

const togglingActive = ref(false)

/** Updates the switch straight away, and puts it back if the API refuses. */
async function setActive(active: boolean) {
  if (!form.value) {
    return
  }

  const previous = form.value

  form.value = { ...previous, active }
  togglingActive.value = true

  try {
    form.value = await updateForm(previous.id, { name: previous.name, active })
    toast.add({
      title: active ? 'Accepting submissions' : 'Not accepting submissions',
      icon: active ? 'i-lucide-play' : 'i-lucide-pause',
    })
  } catch (error) {
    form.value = previous
    toast.add({ title: toApiError(error).message, color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    togglingActive.value = false
  }
}

const menu = computed<DropdownMenuItem[][]>(() => [
  [{ label: 'Duplicate', icon: 'i-lucide-copy', onSelect: duplicate }],
  [{ label: 'Delete form', icon: 'i-lucide-trash-2', color: 'error', onSelect: remove }],
])

async function duplicate() {
  try {
    const copy = await duplicateForm(id.value)

    toast.add({
      title: `Created “${copy.name}”`,
      description: "The copy is inactive and doesn't include entries or recipients.",
      icon: 'i-lucide-copy',
    })
    await navigateTo(`/forms/${copy.id}/settings`)
  } catch (error) {
    toast.add({ title: toApiError(error).message, color: 'error', icon: 'i-lucide-circle-alert' })
  }
}

async function remove() {
  if (!form.value) {
    return
  }

  try {
    await deleteFormWithUndo(form.value, () => refreshNuxtData('forms'))
    await navigateTo('/forms')
  } catch (error) {
    toast.add({ title: toApiError(error).message, color: 'error', icon: 'i-lucide-circle-alert' })
  }
}
</script>

<template>
  <UDashboardPanel :id="`form-${id}`">
    <template #header>
      <UDashboardNavbar :title="form?.name" :ui="{ title: 'truncate' }">
        <template #leading>
          <UDashboardSidebarCollapse />
          <UButton
            to="/forms"
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="ghost"
            aria-label="Back to forms"
          />
        </template>

        <template #right>
          <USwitch
            v-if="form"
            :model-value="form.active"
            :loading="togglingActive"
            :label="form.active ? 'Active' : 'Inactive'"
            @update:model-value="setActive"
          />
          <UDropdownMenu :items="menu" :content="{ align: 'end' }">
            <UButton
              icon="i-lucide-ellipsis-vertical"
              color="neutral"
              variant="ghost"
              aria-label="Form actions"
            />
          </UDropdownMenu>
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <UNavigationMenu :items="tabs" highlight class="-mx-1 flex-1" />
      </UDashboardToolbar>
    </template>

    <template #body>
      <NuxtPage v-if="form" />
    </template>
  </UDashboardPanel>
</template>
