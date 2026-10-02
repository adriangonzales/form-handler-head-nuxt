import type { ComputedRef, InjectionKey, Ref } from 'vue'
import type { LocationQuery } from 'vue-router'
import type {
  FormEntry,
  FormEntryBulkAction,
  FormEntryUpdateBody,
  FormListItem,
  Paginated,
} from '#shared/types/models'

export function entriesKey(formId: string) {
  return `entries:${formId}`
}

export function fetchEntries(formId: string, query: Record<string, string | number>) {
  return useNuxtApp().$api<Paginated<FormEntry>>(`/v1/forms/${formId}/entries`, { query })
}

export async function fetchEntry(id: string) {
  const response = await useNuxtApp().$api<{ data: FormEntry }>(`/v1/entries/${id}`)

  return response.data
}

export async function updateEntry(id: string, body: FormEntryUpdateBody) {
  const response = await useNuxtApp().$api<{ data: FormEntry }>(`/v1/entries/${id}`, {
    method: 'PATCH',
    body,
  })

  return response.data
}

export async function restoreEntry(id: string) {
  const response = await useNuxtApp().$api<{ data: FormEntry }>(`/v1/entries/${id}/restore`, {
    method: 'POST',
  })

  return response.data
}

export function forceDeleteEntry(id: string) {
  return useNuxtApp().$api(`/v1/entries/${id}/force`, { method: 'DELETE' })
}

export async function bulkEntries(formId: string, action: FormEntryBulkAction, ids: string[]) {
  const response = await useNuxtApp().$api<{ data: { action: string; affected: number } }>(
    `/v1/forms/${formId}/entries/bulk`,
    { method: 'POST', body: { action, ids } },
  )

  return response.data.affected
}

/**
 * Returns a function that deletes an entry and offers Undo in the toast. `onChange` runs after the
 * delete and after a restore, so the caller can refresh what it shows. Call it during setup.
 */
export function useDeleteEntryWithUndo() {
  const { $api } = useNuxtApp()
  const toast = useToast()

  return async (id: string, onChange: () => unknown) => {
    await $api(`/v1/entries/${id}`, { method: 'DELETE' })
    await onChange()

    toast.add({
      title: 'Entry moved to Trash',
      icon: 'i-lucide-trash-2',
      actions: [
        {
          label: 'Undo',
          color: 'neutral',
          variant: 'outline',
          onClick: async () => {
            try {
              await $api(`/v1/entries/${id}/restore`, { method: 'POST' })
              await onChange()
              toast.add({ title: 'Entry restored', icon: 'i-lucide-undo-2' })
            } catch (error) {
              toast.add({ title: toApiError(error).message, color: 'error' })
            }
          },
        },
      ],
    })
  }
}

export type EntryCounts = Record<CountedStatus, number>

/**
 * The Inbox, Unread and Spam tab badges. Arriving from the forms list, they start from that form's
 * row; otherwise, and after every triage action, each is a `per_page=1` request for `meta.total`.
 */
export function useEntryCounts(formId: string) {
  const forms = useNuxtData<Paginated<FormListItem>>('forms').data.value
  const row = forms?.data.find((form) => form.id === formId)
  const seed: EntryCounts | undefined = row && {
    inbox: row.entries_count,
    unread: row.unread_entries_count,
    spam: row.spam_entries_count,
  }

  return useAsyncData(
    `entry-counts:${formId}`,
    async (): Promise<EntryCounts> => {
      const totals = await Promise.all(
        countedStatuses.map((status) =>
          fetchEntries(formId, flatFilter(entryApiFilter(status), { per_page: 1 })).then(
            (page) => page.meta.total,
          ),
        ),
      )

      return Object.fromEntries(
        countedStatuses.map((status, i) => [status, totals[i]]),
      ) as EntryCounts
    },
    { immediate: !seed, default: () => seed },
  )
}

function flatFilter(filter: Record<string, string>, query: Record<string, string | number>) {
  for (const [name, value] of Object.entries(filter)) {
    query[`filter[${name}]`] = value
  }

  return query
}

/** What the entries list shares with the entry detail it opens. */
export interface EntriesContext {
  formId: string
  status: ComputedRef<EntryStatus>
  fields: ComputedRef<EntryField[]>
  page: ComputedRef<Paginated<FormEntry> | undefined>
  /** The list's API query, for loading the page before or after this one. */
  apiQuery: ComputedRef<Record<string, string | number>>
  /** The list's route query, kept when moving between the list and an entry. */
  routeQuery: ComputedRef<LocationQuery>
  now: Ref<number | undefined>
  spamCheckWindowMs: number
  /** Replaces a row in place after an update, without reloading the list. */
  patchRow: (entry: FormEntry) => void
  /** Reloads the list and the tab counts after a change that can move entries between tabs. */
  refresh: () => Promise<void>
}

export const entriesContextKey: InjectionKey<EntriesContext> = Symbol('entries')
