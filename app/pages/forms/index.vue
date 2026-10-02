<script setup lang="ts">
import type { DropdownMenuItem, TableColumn } from '@nuxt/ui'
import type { FormListItem } from '#shared/types/models'

useSeoMeta({ title: 'Forms · Form Handler' })

const toast = useToast()
const { state, apiQuery, update } = useListQuery('forms', formListOptions)

const { data, status, error, refresh } = await useAsyncData(
  'forms',
  () => fetchForms(apiQuery.value),
  { watch: [apiQuery] },
)

const forms = computed(() => data.value?.data ?? [])
const total = computed(() => data.value?.meta.total ?? 0)
const isFiltered = computed(() => Object.keys(state.value.filter).length > 0)

const sortItems: { value: string; label: string }[] = formSorts.map(({ value, label }) => ({
  value,
  label,
}))
const pageSizeItems: number[] = [...pageSizes]

const statusFilters = [
  { value: 'all', label: 'All' },
  { value: 'true', label: 'Active' },
  { value: 'false', label: 'Inactive' },
]

const activeFilter = computed({
  get: () => state.value.filter.active ?? 'all',
  set: (value: string) => update({ filter: value === 'all' ? {} : { active: value } }),
})

const sort = computed({
  get: () => state.value.sort,
  set: (value: string) => update({ sort: value }),
})

const perPage = computed({
  get: () => state.value.perPage,
  set: (value: number) => update({ perPage: value }),
})

const page = computed({
  get: () => state.value.page,
  set: (value: number) => update({ page: value }),
})

const columns: TableColumn<FormListItem>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'active', header: 'Status' },
  { accessorKey: 'entries_count', header: 'Entries' },
  { accessorKey: 'unread_entries_count', header: 'Unread' },
  { accessorKey: 'spam_entries_count', header: 'Spam' },
  { accessorKey: 'updated_at', header: 'Updated' },
  { accessorKey: 'created_at', header: 'Created' },
  { id: 'actions', header: () => h('span', { class: 'sr-only' }, 'Actions') },
]

const busyFormId = ref<string>()

function rowActions(form: FormListItem): DropdownMenuItem[][] {
  return [
    [
      { label: 'Open', icon: 'i-lucide-arrow-right', to: `/forms/${form.id}` },
      { label: 'Settings', icon: 'i-lucide-settings', to: `/forms/${form.id}/settings` },
      { label: 'Duplicate', icon: 'i-lucide-copy', onSelect: () => duplicate(form) },
      {
        label: form.active ? 'Deactivate' : 'Activate',
        icon: form.active ? 'i-lucide-pause' : 'i-lucide-play',
        onSelect: () => toggleActive(form),
      },
    ],
    [
      {
        label: 'Delete',
        icon: 'i-lucide-trash-2',
        color: 'error',
        onSelect: () => remove(form),
      },
    ],
  ]
}

async function run(form: FormListItem, action: () => Promise<unknown>) {
  busyFormId.value = form.id

  try {
    await action()
  } catch (error) {
    toast.add({ title: toApiError(error).message, color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    busyFormId.value = undefined
  }
}

function duplicate(form: FormListItem) {
  return run(form, async () => {
    const copy = await duplicateForm(form.id)

    toast.add({
      title: `Created “${copy.name}”`,
      description: "The copy is inactive and doesn't include entries or recipients.",
      icon: 'i-lucide-copy',
    })
    await navigateTo(`/forms/${copy.id}/settings`)
  })
}

function toggleActive(form: FormListItem) {
  return run(form, async () => {
    await updateForm(form.id, { name: form.name, active: !form.active })
    toast.add({
      title: form.active ? `Deactivated “${form.name}”` : `Activated “${form.name}”`,
      icon: form.active ? 'i-lucide-pause' : 'i-lucide-play',
    })
    await refresh()
  })
}

function remove(form: FormListItem) {
  return run(form, () => deleteFormWithUndo(form, refresh))
}

function entriesLink(form: FormListItem, tab?: 'unread' | 'spam') {
  return { path: `/forms/${form.id}/entries`, query: tab ? { status: tab } : undefined }
}
</script>

<template>
  <UDashboardPanel id="forms">
    <template #header>
      <UDashboardNavbar title="Forms">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton to="/forms/new" icon="i-lucide-plus" label="New form" />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <template #left>
          <UTabs
            v-model="activeFilter"
            :items="statusFilters"
            :content="false"
            size="sm"
            aria-label="Filter by status"
          />
        </template>
        <template #right>
          <USelect
            v-model="sort"
            :items="sortItems"
            aria-label="Sort forms"
            class="w-40 sm:w-52"
            icon="i-lucide-arrow-down-up"
          />
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <UAlert
        v-if="error"
        :title="toApiError(error).message"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :actions="[
          { label: 'Retry', color: 'neutral', variant: 'outline', onClick: () => refresh() },
        ]"
      />

      <UEmpty
        v-else-if="status === 'success' && total === 0 && !isFiltered"
        icon="i-lucide-file-plus"
        title="Create your first form"
        description="Define its fields, then post submissions to it from any website."
        :actions="[{ label: 'New form', icon: 'i-lucide-plus', to: '/forms/new' }]"
      />

      <template v-else>
        <UTable
          :data="forms"
          :columns="columns"
          :loading="status === 'pending'"
          empty="No forms match this filter."
          class="shrink-0"
        >
          <template #name-cell="{ row }">
            <NuxtLink
              :to="`/forms/${row.original.id}`"
              class="font-medium text-highlighted hover:underline"
            >
              {{ row.original.name }}
            </NuxtLink>
          </template>

          <template #active-cell="{ row }">
            <UBadge
              :label="row.original.active ? 'Active' : 'Inactive'"
              :color="row.original.active ? 'success' : 'neutral'"
              :icon="row.original.active ? 'i-lucide-circle-check' : 'i-lucide-circle-pause'"
              variant="subtle"
            />
          </template>

          <template #entries_count-cell="{ row }">
            <ULink :to="entriesLink(row.original)" class="tabular-nums">
              {{ row.original.entries_count }}
            </ULink>
          </template>

          <template #unread_entries_count-cell="{ row }">
            <ULink
              v-if="row.original.unread_entries_count > 0"
              :to="entriesLink(row.original, 'unread')"
            >
              <UBadge
                :label="`${row.original.unread_entries_count} unread`"
                color="primary"
                class="tabular-nums"
              />
            </ULink>
            <span v-else class="text-muted">—</span>
          </template>

          <template #spam_entries_count-cell="{ row }">
            <ULink
              v-if="row.original.spam_entries_count > 0"
              :to="entriesLink(row.original, 'spam')"
              class="text-muted tabular-nums"
            >
              {{ row.original.spam_entries_count }}
            </ULink>
            <span v-else class="text-muted">—</span>
          </template>

          <template #updated_at-cell="{ row }">
            <RelativeTime :datetime="row.original.updated_at" />
          </template>

          <template #created_at-cell="{ row }">
            <RelativeTime :datetime="row.original.created_at" />
          </template>

          <template #actions-cell="{ row }">
            <div class="flex justify-end">
              <UDropdownMenu :items="rowActions(row.original)" :content="{ align: 'end' }">
                <UButton
                  icon="i-lucide-ellipsis-vertical"
                  color="neutral"
                  variant="ghost"
                  :loading="busyFormId === row.original.id"
                  :aria-label="`Actions for ${row.original.name}`"
                />
              </UDropdownMenu>
            </div>
          </template>
        </UTable>

        <div
          v-if="total > 0"
          class="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-default pt-4"
        >
          <div class="flex items-center gap-2 text-sm text-muted">
            <span>Rows per page</span>
            <USelect
              v-model="perPage"
              :items="pageSizeItems"
              size="sm"
              class="w-20"
              aria-label="Rows per page"
            />
            <span class="tabular-nums">
              {{ data?.meta.from }}–{{ data?.meta.to }} of {{ total }}
            </span>
          </div>
          <UPagination v-model:page="page" :total="total" :items-per-page="state.perPage" />
        </div>
      </template>
    </template>
  </UDashboardPanel>
</template>
