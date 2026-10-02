<script setup lang="ts">
import type { FormEntry, FormEntryUpdateBody } from '#shared/types/models'
import ConfirmModal from '~/components/ConfirmModal.vue'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const deleteEntryWithUndo = useDeleteEntryWithUndo()
const overlay = useOverlay()
const appConfig = useAppConfig()
const context = inject(entriesContextKey)

if (!context) {
  throw createError({ statusCode: 500, statusMessage: 'The entry view needs the entries list.' })
}

const { formId, status, fields, now, spamCheckWindowMs } = context
const entryId = computed(() => String(route.params.entryId))
const listRow = () => context.page.value?.data.find((row) => row.id === entryId.value)

// The show endpoint doesn't return deleted entries, so Trash shows the list's copy of the row.
const {
  data: entry,
  status: loadStatus,
  error,
  refresh,
} = await useAsyncData(
  () => `entry:${entryId.value}`,
  async () => (status.value === 'trash' ? (listRow() ?? null) : await fetchEntry(entryId.value)),
  { default: () => listRow() ?? null },
)

const notFound = computed(
  () =>
    (error.value && toApiError(error.value).status === 404) ||
    (loadStatus.value === 'success' && !entry.value),
)

function show(updated: FormEntry) {
  entry.value = updated
  context!.patchRow(updated)
}

// --- Mark read on open -----------------------------------------------------------------------

const markedRead = new Set<string>()

watch(
  () => entry.value?.id,
  async (id) => {
    if (!import.meta.client || !id || !entry.value || entry.value.read_at) {
      return
    }

    if (status.value === 'trash' || markedRead.has(id)) {
      return
    }

    markedRead.add(id)

    try {
      show(await updateEntry(id, { read_at: new Date().toISOString() }))
      await refreshNuxtData(`entry-counts:${formId}`)
    } catch {
      // Not worth interrupting reading for; the entry stays unread.
    }
  },
  { immediate: true },
)

// --- Spam check polling ----------------------------------------------------------------------

const checkState = computed(() =>
  entry.value && now.value !== undefined
    ? spamCheckState(entry.value, now.value, spamCheckWindowMs)
    : undefined,
)
let pollTimer: ReturnType<typeof setInterval> | undefined

watch(
  checkState,
  (state) => {
    clearInterval(pollTimer)
    pollTimer =
      state === 'checking'
        ? setInterval(poll, appConfig.entries.spamCheckPollSeconds * 1000)
        : undefined
  },
  { immediate: true },
)
onBeforeUnmount(() => clearInterval(pollTimer))

async function poll() {
  const before = entry.value

  if (!before) {
    return
  }

  try {
    const after = await fetchEntry(before.id)

    if (after.id !== entry.value?.id) {
      return
    }

    show(after)

    if (after.spam && !before.spam) {
      toast.add({
        title: 'Moved to Spam',
        description: after.spam_reason ?? undefined,
        color: 'warning',
        icon: 'i-lucide-shield-alert',
      })
      await context!.refresh()
    }
  } catch {
    // Try again on the next tick.
  }
}

// --- Previous / next -------------------------------------------------------------------------

const lastIndex = ref<number>()
const neighbours = computed(() =>
  adjacentEntries(context.page.value?.data ?? [], entryId.value, lastIndex.value),
)

watch(
  neighbours,
  ({ index }) => {
    if (index !== -1) {
      lastIndex.value = index
    }
  },
  { immediate: true },
)

const currentPage = computed(() => context.page.value?.meta.current_page ?? 1)
const lastPage = computed(() => context.page.value?.meta.last_page ?? 1)
const hasPrevious = computed(() => Boolean(neighbours.value.previous) || currentPage.value > 1)
const hasNext = computed(() => Boolean(neighbours.value.next) || currentPage.value < lastPage.value)
const moving = ref(false)

function goTo(id: string, page = currentPage.value) {
  const query = { ...context!.routeQuery.value }

  if (page > 1) {
    query.page = String(page)
  } else {
    delete query.page
  }

  return router.replace({ path: `/forms/${formId}/entries/${id}`, query })
}

/** Moves through the list, loading the page before or after this one at its edges. */
async function move(direction: -1 | 1) {
  const adjacent = direction === 1 ? neighbours.value.next : neighbours.value.previous

  if (adjacent) {
    return goTo(adjacent.id)
  }

  const page = currentPage.value + direction

  if (page < 1 || page > lastPage.value || moving.value) {
    return
  }

  moving.value = true

  try {
    const rows = (await fetchEntries(formId, { ...context!.apiQuery.value, page })).data
    const target = direction === 1 ? rows[0] : rows.at(-1)

    if (target) {
      lastIndex.value = undefined
      await goTo(target.id, page)
    }
  } catch (error) {
    toast.add({ title: toApiError(error).message, color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    moving.value = false
  }
}

defineShortcuts({
  j: () => void move(1),
  k: () => void move(-1),
})

function close() {
  void router.push({ path: `/forms/${formId}/entries`, query: context!.routeQuery.value })
}

// --- Actions ---------------------------------------------------------------------------------

const busy = ref<string>()

async function run(name: string, action: () => Promise<unknown>) {
  busy.value = name

  try {
    await action()
  } catch (error) {
    toast.add({ title: toApiError(error).message, color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    busy.value = undefined
  }
}

function change(name: string, body: FormEntryUpdateBody, message?: string) {
  return run(name, async () => {
    show(await updateEntry(entryId.value, body))
    await context!.refresh()

    if (message) {
      toast.add({ title: message, icon: 'i-lucide-check' })
    }
  })
}

const toggleStar = () => change('star', { starred: !entry.value?.starred })
const markUnread = () =>
  run('read', async () => {
    // Don't mark it read again while it's still open.
    markedRead.add(entryId.value)
    show(await updateEntry(entryId.value, { read_at: null }))
    await context!.refresh()
    toast.add({ title: 'Marked as unread', icon: 'i-lucide-mail' })
  })
const markRead = () => change('read', { read_at: new Date().toISOString() })
const toggleSpam = () =>
  change(
    'spam',
    { spam: !entry.value?.spam },
    entry.value?.spam ? 'Marked as not spam' : 'Marked as spam',
  )

const remove = () =>
  run('delete', async () => {
    await deleteEntryWithUndo(entryId.value, context!.refresh)
    close()
  })

const restore = () =>
  run('restore', async () => {
    await restoreEntry(entryId.value)
    await context!.refresh()
    toast.add({ title: 'Entry restored', icon: 'i-lucide-undo-2' })
    close()
  })

const confirm = overlay.create(ConfirmModal)

async function forceDelete() {
  const confirmed = await confirm.open({
    title: 'Permanently delete this entry?',
    description: "Its submitted data is erased and can't be recovered.",
    confirmLabel: 'Delete permanently',
  }).result

  if (!confirmed) {
    return
  }

  await run('force', async () => {
    await forceDeleteEntry(entryId.value)
    await context!.refresh()
    toast.add({ title: 'Entry permanently deleted', icon: 'i-lucide-trash' })
    close()
  })
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <header class="flex items-center gap-2 border-b border-default px-4 py-3 sm:px-6">
      <h2 class="flex-1 truncate font-semibold text-highlighted">
        Entry
        <span v-if="entry?.deleted_at" class="font-normal text-muted">(in Trash)</span>
      </h2>
      <UButton
        icon="i-lucide-chevron-up"
        color="neutral"
        variant="ghost"
        aria-label="Previous entry"
        aria-keyshortcuts="k"
        :disabled="!hasPrevious || moving"
        @click="move(-1)"
      />
      <UButton
        icon="i-lucide-chevron-down"
        color="neutral"
        variant="ghost"
        aria-label="Next entry"
        aria-keyshortcuts="j"
        :disabled="!hasNext || moving"
        @click="move(1)"
      />
      <UButton
        icon="i-lucide-x"
        color="neutral"
        variant="ghost"
        aria-label="Close entry"
        @click="close"
      />
    </header>

    <div v-if="entry" class="flex flex-wrap gap-2 border-b border-default px-4 py-3 sm:px-6">
      <template v-if="status !== 'trash' && !entry.deleted_at">
        <UButton
          :label="entry.starred ? 'Starred' : 'Star'"
          icon="i-lucide-star"
          :color="entry.starred ? 'warning' : 'neutral'"
          variant="outline"
          size="sm"
          :class="entry.starred ? '[&_svg]:fill-current' : ''"
          :aria-pressed="entry.starred"
          :loading="busy === 'star'"
          @click="toggleStar"
        />
        <UButton
          v-if="entry.read_at"
          label="Mark as unread"
          icon="i-lucide-mail"
          color="neutral"
          variant="outline"
          size="sm"
          :loading="busy === 'read'"
          @click="markUnread"
        />
        <UButton
          v-else
          label="Mark as read"
          icon="i-lucide-mail-open"
          color="neutral"
          variant="outline"
          size="sm"
          :loading="busy === 'read'"
          @click="markRead"
        />
        <UButton
          :label="entry.spam ? 'Not spam' : 'Mark as spam'"
          :icon="entry.spam ? 'i-lucide-shield-check' : 'i-lucide-shield-alert'"
          color="neutral"
          variant="outline"
          size="sm"
          :loading="busy === 'spam'"
          @click="toggleSpam"
        />
        <UButton
          label="Delete"
          icon="i-lucide-trash-2"
          color="error"
          variant="outline"
          size="sm"
          class="ms-auto"
          :loading="busy === 'delete'"
          @click="remove"
        />
      </template>
      <template v-else>
        <UButton
          label="Restore"
          icon="i-lucide-undo-2"
          color="neutral"
          variant="outline"
          size="sm"
          :loading="busy === 'restore'"
          @click="restore"
        />
        <UButton
          label="Delete permanently"
          icon="i-lucide-trash"
          color="error"
          variant="outline"
          size="sm"
          class="ms-auto"
          :loading="busy === 'force'"
          @click="forceDelete"
        />
      </template>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6">
      <EntriesEntryDetail
        v-if="entry"
        :entry="entry"
        :fields="fields"
        :now="now"
        :spam-check-window-ms="spamCheckWindowMs"
      />
      <UEmpty
        v-else-if="notFound"
        icon="i-lucide-search-x"
        title="Entry not found"
        description="It may have been deleted, or moved out of this list."
        :actions="[
          { label: 'Back to entries', color: 'neutral', variant: 'outline', onClick: close },
        ]"
      />
      <UAlert
        v-else-if="error"
        :title="toApiError(error).message"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :actions="[
          { label: 'Retry', color: 'neutral', variant: 'outline', onClick: () => refresh() },
        ]"
      />
      <!-- Opened from a link, before the entry has loaded (from the list it shows the row's copy). -->
      <div v-else-if="loadStatus === 'pending'" class="space-y-6" aria-busy="true">
        <span class="sr-only">Loading entry…</span>
        <div v-for="index in 4" :key="index" class="space-y-2">
          <USkeleton class="h-4 w-24" />
          <USkeleton class="h-5 w-3/4" />
        </div>
      </div>
    </div>
  </div>
</template>
