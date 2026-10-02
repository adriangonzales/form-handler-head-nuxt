<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { FormEntryExport, FormListItem, Paginated } from '#shared/types/models'

useSeoMeta({ title: 'Exports · Form Handler' })

const { state, update } = useListQuery('exports', {
  sorts: ['-created_at'],
  defaultSort: '-created_at',
  filters: {},
})

// The index has no sort or filters: always newest first.
const apiQuery = computed(() => ({ page: state.value.page, per_page: state.value.perPage }))

const { data, status, error, refresh } = await useAsyncData(
  'entry-exports',
  () => fetchExports(apiQuery.value),
  { watch: [apiQuery] },
)

const formNames = await useFormNames(() => (data.value?.data ?? []).map((row) => row.form_id))

const total = computed(() => data.value?.meta.total ?? 0)
const pageSizeItems: number[] = [...pageSizes]
const perPage = computed({
  get: () => state.value.perPage,
  set: (value: number) => update({ perPage: value }),
})
const page = computed({
  get: () => state.value.page,
  set: (value: number) => update({ page: value }),
})

function setRows(change: (rows: FormEntryExport[]) => FormEntryExport[]) {
  if (data.value) {
    data.value = { ...data.value, data: change(data.value.data) } as Paginated<FormEntryExport>
  }
}

const rows: ExportRows = {
  exports: () => data.value?.data ?? [],
  update: (updated) =>
    setRows((list) => list.map((row) => (row.id === updated.id ? updated : row))),
  remove: (id) => setRows((list) => list.filter((row) => row.id !== id)),
  add: (added) => {
    if (state.value.page === 1) {
      setRows((list) => [added, ...list])
    }
  },
}

const { busy, download, retry } = useExportActions(rows)

useExportPolling(rows)

const columns: TableColumn<FormEntryExport>[] = [
  { id: 'form', header: 'Form' },
  { id: 'filters', header: 'Filters' },
  { accessorKey: 'created_at', header: 'Requested' },
  { accessorKey: 'status', header: 'Status' },
  { accessorKey: 'expires_at', header: 'Expires' },
  { id: 'actions', header: () => h('span', { class: 'sr-only' }, 'Actions') },
]

/**
 * Form names for exports, which only carry `form_id`. Loaded from the forms list once per session,
 * and again if an export belongs to a form that wasn't known yet (created since).
 */
async function useFormNames(formIds: () => string[]) {
  const nuxtApp = useNuxtApp()
  const names = useState<Record<string, string> | null>('form-names', () => null)

  async function load() {
    const loaded: Record<string, string> = {}
    let pageNumber = 1
    let lastPage = 1

    do {
      const query = { page: pageNumber, per_page: 100, sort: 'name' }
      // Later pages run after an await, where Nuxt's context is gone.
      const result: Paginated<FormListItem> = await nuxtApp.runWithContext(() => fetchForms(query))

      for (const form of result.data) {
        loaded[form.id] = form.name
      }

      lastPage = result.meta.last_page
      pageNumber += 1
    } while (pageNumber <= Math.min(lastPage, 10))

    names.value = loaded
  }

  const missing = () => formIds().some((id) => !names.value?.[id])

  // Registered before the await below, so it belongs to the page.
  watch(formIds, () => {
    if (missing()) {
      void load().catch(() => {})
    }
  })

  if (!names.value || missing()) {
    try {
      await load()
    } catch {
      names.value ??= {}
    }
  }

  return names
}
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
        v-else-if="status === 'success' && total === 0"
        icon="i-lucide-file-down"
        title="No recent exports"
        description="Export a form's entries as CSV from its Entries tab. Exports are kept for 24 hours."
        :actions="[{ label: 'Go to forms', color: 'neutral', variant: 'outline', to: '/forms' }]"
      />

      <template v-else>
        <p class="text-sm text-muted">
          CSV exports from the last 24 hours, across all your forms. Dates in the files are in UTC.
        </p>

        <UTable
          :data="data?.data ?? []"
          :columns="columns"
          :loading="status === 'pending'"
          class="shrink-0"
        >
          <template #form-cell="{ row }">
            <NuxtLink
              v-if="formNames?.[row.original.form_id]"
              :to="`/forms/${row.original.form_id}/entries`"
              class="font-medium text-highlighted hover:underline"
            >
              {{ formNames[row.original.form_id] }}
            </NuxtLink>
            <span v-else class="font-mono text-xs">{{ row.original.filename }}</span>
          </template>

          <template #filters-cell="{ row }">
            {{ summariseParameters(row.original.parameters) }}
          </template>

          <template #created_at-cell="{ row }">
            <RelativeTime :datetime="row.original.created_at" />
          </template>

          <template #status-cell="{ row }">
            <ExportsExportStatus :entry-export="row.original" />
          </template>

          <template #expires_at-cell="{ row }">
            <RelativeTime :datetime="row.original.expires_at" />
          </template>

          <template #actions-cell="{ row }">
            <div class="flex justify-end">
              <ExportsExportActions
                :entry-export="row.original"
                :busy="busy === row.original.id"
                @download="download(row.original)"
                @retry="retry(row.original)"
              />
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
