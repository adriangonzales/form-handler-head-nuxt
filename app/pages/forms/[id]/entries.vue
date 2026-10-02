<script setup lang="ts">
import type { TableColumn, TabsItem } from '@nuxt/ui'
import type { Form, FormEntry } from '#shared/types/models'
import ConfirmModal from '~/components/ConfirmModal.vue'

const UCheckbox = resolveComponent('UCheckbox')

const route = useRoute()
const router = useRouter()
const toast = useToast()
const overlay = useOverlay()
const appConfig = useAppConfig()
const formId = String(route.params.id)

const { data: form } = useNuxtData<Form>(formKey(formId))
const { state, update } = useListQuery('entries', entryListOptions)

const status = computed(() => entryStatus(state.value))
const apiQuery = computed(() => entryApiQuery(state.value))
const fields = computed(() => entryFields(form.value?.schema))

const {
  data,
  status: loadStatus,
  error,
  refresh: refreshList,
} = await useAsyncData(entriesKey(formId), () => fetchEntries(formId, apiQuery.value), {
  watch: [apiQuery],
})

const { data: counts, refresh: refreshCounts } = await useEntryCounts(formId)

const rows = computed(() => data.value?.data ?? [])
const total = computed(() => data.value?.meta.total ?? 0)
const hasDateFilter = computed(() => Boolean(state.value.filter.from || state.value.filter.to))

async function refresh() {
  await Promise.all([refreshList(), refreshCounts()])
}

function patchRow(entry: FormEntry) {
  if (!data.value) {
    return
  }

  data.value = {
    ...data.value,
    data: data.value.data.map((row) => (row.id === entry.id ? entry : row)),
  }
}

// --- Spam check state -----------------------------------------------------------------------

const spamCheckWindowMs = appConfig.entries.spamCheckWindowSeconds * 1000
const now = useNow(1000)

function checkState(entry: FormEntry) {
  return now.value === undefined ? undefined : spamCheckState(entry, now.value, spamCheckWindowMs)
}

// While any row is waiting for its spam check, reload every few seconds so entries the classifier
// flags leave the Inbox without a manual reload. Rows stop counting as checking after the window.
const hasChecking = computed(() => rows.value.some((entry) => checkState(entry) === 'checking'))
let pollTimer: ReturnType<typeof setInterval> | undefined

watch(
  hasChecking,
  (checking) => {
    clearInterval(pollTimer)
    pollTimer = checking
      ? setInterval(() => void refresh(), appConfig.entries.spamCheckPollSeconds * 1000)
      : undefined
  },
  { immediate: true },
)
onBeforeUnmount(() => clearInterval(pollTimer))

// --- Filters ---------------------------------------------------------------------------------

const tabLabels: Record<EntryStatus, string> = {
  inbox: 'Inbox',
  unread: 'Unread',
  starred: 'Starred',
  spam: 'Spam',
  trash: 'Trash',
}

const tabs = computed<TabsItem[]>(() =>
  entryStatuses.map((value) => {
    const count = (countedStatuses as readonly string[]).includes(value)
      ? counts.value?.[value as CountedStatus]
      : undefined

    return {
      value,
      label: tabLabels[value],
      badge:
        count === undefined
          ? undefined
          : {
              label: String(count),
              // A primary badge would vanish on the primary active tab.
              color:
                value === 'unread' && count > 0 && status.value !== 'unread'
                  ? 'primary'
                  : 'neutral',
              variant: 'subtle',
              class: 'tabular-nums',
            },
    }
  }),
)

const statusModel = computed({
  get: () => status.value,
  set: (value: string) => update({ filter: { ...state.value.filter, status: value } }),
})

const sortItems: { value: string; label: string }[] = entrySorts.map(({ value, label }) => ({
  value,
  label,
}))
const sort = computed({
  get: () => state.value.sort,
  set: (value: string) => update({ sort: value }),
})

function setDates({ from, to }: { from?: string; to?: string }) {
  update({ filter: { status: state.value.filter.status, from, to } })
}

const apiError = computed(() => (error.value ? toApiError(error.value) : undefined))
const dateError = computed(() => {
  const errors = apiError.value?.errors ?? {}

  return errors['filter.created_to']?.[0] ?? errors['filter.created_from']?.[0]
})

const pageSizeItems: number[] = [...pageSizes]
const perPage = computed({
  get: () => state.value.perPage,
  set: (value: number) => update({ perPage: value }),
})
const page = computed({
  get: () => state.value.page,
  set: (value: number) => update({ page: value }),
})

// --- Table -----------------------------------------------------------------------------------

const rowSelection = ref<Record<string, boolean>>({})
const selectedIds = computed(() =>
  Object.keys(rowSelection.value).filter((id) => rowSelection.value[id]),
)

// Selection is limited to the page on screen.
watch(data, () => {
  const visible = new Set(rows.value.map((row) => row.id))

  rowSelection.value = Object.fromEntries(
    Object.entries(rowSelection.value).filter(([id, selected]) => selected && visible.has(id)),
  )
})

const columns = computed<TableColumn<FormEntry>[]>(() => [
  {
    id: 'select',
    header: ({ table }) =>
      h(UCheckbox, {
        modelValue: table.getIsSomePageRowsSelected()
          ? 'indeterminate'
          : table.getIsAllPageRowsSelected(),
        'onUpdate:modelValue': (value: boolean | 'indeterminate') =>
          table.toggleAllPageRowsSelected(Boolean(value)),
        'aria-label': 'Select all on this page',
      }),
    cell: ({ row }) =>
      h(UCheckbox, {
        modelValue: row.getIsSelected(),
        'onUpdate:modelValue': (value: boolean | 'indeterminate') =>
          row.toggleSelected(Boolean(value)),
        'aria-label': `Select entry received ${row.original.created_at ?? ''}`,
      }),
    meta: { class: { th: 'w-px', td: 'w-px' } },
  },
  {
    id: 'unread',
    header: () => h('span', { class: 'sr-only' }, 'Unread'),
    meta: { class: { th: 'w-px px-0', td: 'w-px px-0' } },
  },
  {
    id: 'star',
    header: () => h('span', { class: 'sr-only' }, 'Starred'),
    meta: { class: { th: 'w-px px-1', td: 'w-px px-1' } },
  },
  { id: 'received', header: 'Received' },
  ...fields.value.map((field, index): TableColumn<FormEntry> => ({
    id: `field-${index}`,
    header: field.label,
    accessorFn: (entry) => formatEntryValue(entry.input?.[field.key]),
  })),
  { id: 'spam', header: () => h('span', { class: 'sr-only' }, 'Spam') },
])

function entryLink(entry: Pick<FormEntry, 'id'>) {
  return { path: `/forms/${formId}/entries/${entry.id}`, query: route.query }
}

function openEntry(_event: Event, row: { original: FormEntry }) {
  void navigateTo(entryLink(row.original))
}

const starring = ref(new Set<string>())

async function toggleStar(entry: FormEntry) {
  starring.value.add(entry.id)
  patchRow({ ...entry, starred: !entry.starred })

  try {
    patchRow(await updateEntry(entry.id, { starred: !entry.starred }))

    if (status.value === 'starred') {
      await refreshList()
    }
  } catch (error) {
    patchRow(entry)
    toast.add({ title: toApiError(error).message, color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    starring.value.delete(entry.id)
  }
}

// --- Bulk actions ----------------------------------------------------------------------------

const busyAction = ref<BulkActionItem['action']>()
const confirm = overlay.create(ConfirmModal)

async function runBulk(item: BulkActionItem) {
  const ids = [...selectedIds.value]

  if (ids.length === 0) {
    return
  }

  if (item.action === 'force_delete') {
    const confirmed = await confirm.open({
      title: `Permanently delete ${entriesLabel(ids.length)}?`,
      description: "Their submitted data is erased and can't be recovered.",
      confirmLabel: 'Delete permanently',
    }).result

    if (!confirmed) {
      return
    }
  }

  busyAction.value = item.action

  try {
    const affected = await bulkEntries(formId, item.action, ids)

    rowSelection.value = {}
    await refresh()
    toast.add({
      title: bulkResultMessage(item, affected, ids.length),
      icon: item.icon,
      actions:
        item.action === 'delete' && affected > 0
          ? [
              {
                label: 'Undo',
                color: 'neutral',
                variant: 'outline',
                onClick: () => void undoBulkDelete(ids),
              },
            ]
          : undefined,
    })
  } catch (error) {
    const failure = toApiError(error)

    if (failure.status === 422 && isStaleSelectionError(failure.errors)) {
      toast.add({
        title: 'Some entries changed. Refresh and try again.',
        color: 'warning',
        icon: 'i-lucide-refresh-cw',
      })
      await refresh()
    } else {
      toast.add({ title: failure.message, color: 'error', icon: 'i-lucide-circle-alert' })
    }
  } finally {
    busyAction.value = undefined
  }
}

async function undoBulkDelete(ids: string[]) {
  try {
    const restored = await bulkEntries(formId, 'restore', ids)

    await refresh()
    toast.add({ title: `${entriesLabel(restored)} restored`, icon: 'i-lucide-undo-2' })
  } catch (error) {
    toast.add({ title: toApiError(error).message, color: 'error' })
  }
}

// --- Entry detail ----------------------------------------------------------------------------

const detailOpen = computed(() => Boolean(route.params.entryId))

provide(entriesContextKey, {
  formId,
  status,
  fields,
  page: computed(() => data.value ?? undefined),
  apiQuery,
  routeQuery: computed(() => route.query),
  now,
  spamCheckWindowMs,
  patchRow,
  refresh,
})

function closeDetail() {
  void router.push({ path: `/forms/${formId}/entries`, query: route.query })
}

const emptyText = computed(() =>
  hasDateFilter.value
    ? 'No entries were received in this date range.'
    : {
        inbox: 'No entries.',
        unread: "You're all caught up.",
        starred: 'No starred entries.',
        spam: 'No spam.',
        trash: 'Trash is empty.',
      }[status.value],
)
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <UTabs
        v-model="statusModel"
        :items="tabs"
        :content="false"
        size="sm"
        aria-label="Entry status"
      />
      <div class="flex flex-wrap items-start gap-2">
        <EntriesEntryFilters
          :from="state.filter.from"
          :to="state.filter.to"
          :error="dateError"
          @change="setDates"
        />
        <USelect
          v-model="sort"
          :items="sortItems"
          aria-label="Sort entries"
          class="w-44"
          icon="i-lucide-arrow-down-up"
        />
        <EntriesExportButton :form-id="formId" :api-query="apiQuery" />
      </div>
    </div>

    <UAlert
      v-if="apiError && !dateError"
      :title="apiError.message"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :actions="[
        { label: 'Retry', color: 'neutral', variant: 'outline', onClick: () => refresh() },
      ]"
    />

    <UEmpty
      v-else-if="loadStatus === 'success' && total === 0 && status === 'inbox' && !hasDateFilter"
      icon="i-lucide-inbox"
      title="No entries yet"
      description="Add the form to your site, or send a test submission, and entries will show up here."
      :actions="[{ label: 'Integrate', icon: 'i-lucide-code', to: `/forms/${formId}/integrate` }]"
    />

    <template v-else-if="!apiError">
      <EntriesEntryBulkBar
        v-if="selectedIds.length > 0"
        :status="status"
        :count="selectedIds.length"
        :busy="busyAction"
        @run="runBulk"
        @clear="rowSelection = {}"
      />

      <UTable
        v-model:row-selection="rowSelection"
        :data="rows"
        :columns="columns"
        :get-row-id="(entry: FormEntry) => entry.id"
        :loading="loadStatus === 'pending'"
        :empty="emptyText"
        :meta="{
          class: {
            tr: (row) => (row.original.read_at ? '' : 'font-semibold [&>td]:text-highlighted'),
          },
        }"
        :ui="{ td: 'max-w-64 truncate' }"
        class="min-h-0 shrink-0"
        @select="openEntry"
      >
        <template #unread-cell="{ row }">
          <span v-if="!row.original.read_at" class="flex justify-center">
            <span class="size-2 rounded-full bg-primary" aria-hidden="true" />
            <span class="sr-only">Unread</span>
          </span>
        </template>

        <template #star-cell="{ row }">
          <UButton
            v-if="status !== 'trash'"
            :icon="row.original.starred ? 'i-lucide-star' : 'i-lucide-star'"
            :color="row.original.starred ? 'warning' : 'neutral'"
            variant="ghost"
            size="sm"
            :class="row.original.starred ? '[&_svg]:fill-current' : 'text-dimmed'"
            :aria-label="row.original.starred ? 'Unstar entry' : 'Star entry'"
            :aria-pressed="row.original.starred"
            :disabled="starring.has(row.original.id)"
            @click="toggleStar(row.original)"
          />
          <UIcon
            v-else-if="row.original.starred"
            name="i-lucide-star"
            class="size-4 fill-current text-warning"
            aria-label="Starred"
          />
        </template>

        <template #received-cell="{ row }">
          <NuxtLink :to="entryLink(row.original)" class="hover:underline">
            <RelativeTime :datetime="row.original.created_at" />
          </NuxtLink>
        </template>

        <template v-for="(_, index) in fields" :key="index" #[`field-${index}-cell`]="{ getValue }">
          <span v-if="getValue()">{{ getValue() }}</span>
          <span v-else class="text-dimmed">—</span>
        </template>

        <template #spam-cell="{ row }">
          <UTooltip
            v-if="row.original.spam"
            :text="
              spamLikelihood(row.original) !== null
                ? `${spamLikelihood(row.original)}% likely spam`
                : (row.original.spam_reason ?? 'Marked as spam')
            "
          >
            <UBadge label="Spam" color="warning" variant="subtle" icon="i-lucide-shield-alert" />
          </UTooltip>
          <UBadge
            v-else-if="checkState(row.original) === 'checking'"
            label="Checking…"
            color="neutral"
            variant="soft"
            class="font-normal"
          />
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

    <USlideover
      :open="detailOpen"
      :ui="{ content: 'sm:max-w-2xl' }"
      title="Entry"
      @update:open="(open) => !open && closeDetail()"
    >
      <template #content>
        <NuxtPage />
      </template>
    </USlideover>
  </div>
</template>
