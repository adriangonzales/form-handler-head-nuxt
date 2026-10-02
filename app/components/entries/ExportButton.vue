<script setup lang="ts">
import type { FormEntryExport, Paginated } from '#shared/types/models'

/**
 * Export CSV for the entries table's current filters and sort, and an Exports popover with this
 * form's recent exports. The export index can't be filtered by form, so the popover keeps this
 * form's rows from the account's 100 most recent exports.
 */
const props = defineProps<{
  formId: string
  /** The entries table's API query; its filters and sort are exported, never its page. */
  apiQuery: Record<string, string | number>
}>()

const toast = useToast()
const open = ref(false)
const starting = ref(false)

const { data, status, refresh } = useAsyncData(
  'entry-exports:recent',
  () => fetchExports({ per_page: 100 }),
  { server: false, lazy: true },
)

const formExports = computed(() =>
  (data.value?.data ?? []).filter((entryExport) => entryExport.form_id === props.formId),
)
const inProgress = computed(() => formExports.value.filter(isInProgress).length)
const hasMore = computed(() => (data.value?.meta.last_page ?? 1) > 1)

function setRows(change: (rows: FormEntryExport[]) => FormEntryExport[]) {
  if (data.value) {
    data.value = { ...data.value, data: change(data.value.data) } as Paginated<FormEntryExport>
  }
}

const rows: ExportRows = {
  exports: () => formExports.value,
  update: (updated) =>
    setRows((list) => list.map((row) => (row.id === updated.id ? updated : row))),
  remove: (id) => setRows((list) => list.filter((row) => row.id !== id)),
  add: (added) => {
    if (data.value) {
      setRows((list) => [added, ...list.filter((row) => row.id !== added.id)])
    } else {
      void refresh()
    }
  },
}

const { busy, download, retry, start } = useExportActions(rows)

// Exports started here announce themselves when they finish while the popover is closed.
const startedHere = new Set<string>()

useExportPolling(rows, (entryExport) => {
  if (!startedHere.delete(entryExport.id) || open.value) {
    return
  }

  if (entryExport.status === 'completed') {
    toast.add({
      title: 'Export ready',
      description: entriesLabel(entryExport.row_count ?? 0),
      icon: 'i-lucide-file-check',
      actions: [
        {
          label: 'Download',
          color: 'neutral',
          variant: 'outline',
          onClick: () => void download(entryExport),
        },
      ],
    })
  } else {
    toast.add({
      title: 'Export failed',
      description: entryExport.error ?? undefined,
      color: 'error',
      icon: 'i-lucide-circle-alert',
    })
  }
})

async function begin(parameters: ExportParameters) {
  starting.value = true

  try {
    const started = await start({ form_id: props.formId, parameters })

    startedHere.add(started.id)
    open.value = true
  } catch (error) {
    toast.add({ title: toApiError(error).message, color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    starting.value = false
  }
}

function exportCsv() {
  const parameters = exportParameters(props.apiQuery)
  const duplicate = formExports.value.find(
    (entryExport) =>
      isInProgress(entryExport) && sameParameters(entryExport.parameters, parameters),
  )

  if (!duplicate) {
    return begin(parameters)
  }

  toast.add({
    title: 'An export with these filters is already being prepared',
    description: 'It will appear under Exports when it is ready.',
    color: 'warning',
    icon: 'i-lucide-loader-circle',
    actions: [
      {
        label: 'Export anyway',
        color: 'neutral',
        variant: 'outline',
        onClick: () => void begin(parameters),
      },
    ],
  })
  open.value = true
}
</script>

<template>
  <UFieldGroup>
    <UButton
      label="Export CSV"
      icon="i-lucide-file-down"
      color="neutral"
      variant="outline"
      :loading="starting"
      @click="exportCsv"
    />
    <UPopover v-model:open="open" :content="{ align: 'end' }">
      <UButton
        color="neutral"
        variant="outline"
        trailing-icon="i-lucide-chevron-down"
        :aria-label="inProgress > 0 ? `Exports, ${inProgress} in progress` : 'Exports'"
      >
        <span class="sr-only sm:not-sr-only">Exports</span>
        <UBadge
          v-if="inProgress > 0"
          :label="String(inProgress)"
          color="primary"
          size="sm"
          class="tabular-nums"
        />
      </UButton>

      <template #content>
        <div class="w-[min(32rem,calc(100vw-2rem))] space-y-3 p-4">
          <div class="flex items-center justify-between gap-2">
            <h2 class="font-semibold text-highlighted">Recent exports</h2>
            <ULink to="/exports" class="text-sm">All exports</ULink>
          </div>

          <USkeleton v-if="status === 'pending' && !data" class="h-16 w-full" />
          <p v-else-if="formExports.length === 0" class="py-4 text-sm text-muted">
            No exports of this form in the last 24 hours. Export CSV exports the entries matching
            the current tab, dates and sort.
          </p>
          <ExportsExportList
            v-else
            :exports="formExports"
            :busy="busy"
            class="max-h-80 overflow-y-auto"
            @download="download"
            @retry="retry"
          />

          <p v-if="hasMore" class="text-xs text-muted">
            Only your 100 most recent exports are checked here.
            <ULink to="/exports">See all exports</ULink>.
          </p>

          <UCollapsible class="border-t border-default pt-3 text-sm">
            <UButton
              label="What's in the file?"
              color="neutral"
              variant="link"
              size="sm"
              trailing-icon="i-lucide-chevron-down"
              class="px-0"
            />
            <template #content>
              <ul class="mt-2 list-disc space-y-1 ps-5 text-xs text-muted">
                <li>
                  Entries that match the filters when the export runs, not when you asked for it.
                </li>
                <li>A column per field, then columns for older fields the form no longer has.</li>
                <li>
                  Received, read and spam check times (<code>spam_checked_at</code>), all in UTC.
                </li>
                <li>Exports are kept for 24 hours.</li>
              </ul>
            </template>
          </UCollapsible>
        </div>
      </template>
    </UPopover>
  </UFieldGroup>
</template>
