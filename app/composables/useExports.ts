import type { FormEntryExport, Paginated } from '#shared/types/models'

export function fetchExports(query: Record<string, string | number>) {
  return useNuxtApp().$api<Paginated<FormEntryExport>>('/v1/entry-exports', { query })
}

export async function fetchExport(id: string) {
  const response = await useNuxtApp().$api<{ data: FormEntryExport }>(`/v1/entry-exports/${id}`)

  return response.data
}

export async function createExport(formId: string, parameters: ExportParameters) {
  const response = await useNuxtApp().$api<{ data: FormEntryExport }>(
    `/v1/forms/${formId}/entries/exports`,
    { method: 'POST', body: parameters },
  )

  return response.data
}

/** How a view that lists exports lets the polling and actions change its rows. */
export interface ExportRows {
  exports: () => readonly FormEntryExport[]
  /** Replaces a row with a newer copy of the same export. */
  update: (entryExport: FormEntryExport) => void
  /** Drops a row that has expired. */
  remove: (id: string) => void
  /** Adds a newly started export at the top. */
  add: (entryExport: FormEntryExport) => void
}

/**
 * Polls every export in the list that's still in progress, every 2 s and then every 10 s after
 * 30 s, until it completes or fails. Polling pauses while the tab is hidden, and stops when the
 * view unmounts. `onSettled` is told when an export finishes.
 */
export function useExportPolling(
  rows: ExportRows,
  onSettled?: (entryExport: FormEntryExport) => void,
) {
  const trackers = new Map<string, { startedAt: number; timer?: ReturnType<typeof setTimeout> }>()
  const waitingForVisible = new Set<string>()
  let active = true

  function schedule(id: string) {
    const tracker = trackers.get(id)

    if (!tracker || !active) {
      return
    }

    tracker.timer = setTimeout(() => void tick(id), pollDelay(Date.now() - tracker.startedAt))
  }

  async function tick(id: string) {
    if (document.visibilityState === 'hidden') {
      waitingForVisible.add(id)

      return
    }

    let entryExport: FormEntryExport

    try {
      entryExport = await fetchExport(id)
    } catch (error) {
      if (toApiError(error).status === 404) {
        trackers.delete(id)
        rows.remove(id)
      } else {
        schedule(id)
      }

      return
    }

    if (!active || !trackers.has(id)) {
      return
    }

    rows.update(entryExport)

    if (isInProgress(entryExport)) {
      schedule(id)
    } else {
      trackers.delete(id)
      onSettled?.(entryExport)
    }
  }

  function onVisibilityChange() {
    if (document.visibilityState !== 'visible') {
      return
    }

    for (const id of waitingForVisible) {
      void tick(id)
    }

    waitingForVisible.clear()
  }

  onMounted(() => {
    document.addEventListener('visibilitychange', onVisibilityChange)

    watch(
      () =>
        rows
          .exports()
          .filter(isInProgress)
          .map((entryExport) => entryExport.id),
      (ids) => {
        for (const id of ids) {
          if (!trackers.has(id)) {
            trackers.set(id, { startedAt: Date.now() })
            schedule(id)
          }
        }
      },
      { immediate: true },
    )
  })

  onBeforeUnmount(() => {
    active = false
    document.removeEventListener('visibilitychange', onVisibilityChange)

    for (const tracker of trackers.values()) {
      clearTimeout(tracker.timer)
    }

    trackers.clear()
  })
}

/**
 * Download and Try again for a list of exports. Call it during setup.
 *
 * Download fetches the export again for a fresh signed link, because a link from an earlier
 * response may have expired, then starts an ordinary browser download from the API. The file never
 * passes through this app.
 */
export function useExportActions(rows: ExportRows) {
  const toast = useToast()
  const busy = ref<string>()

  async function retry(entryExport: Pick<FormEntryExport, 'form_id' | 'parameters'>) {
    const started = await createExport(entryExport.form_id, entryExport.parameters)

    rows.add(started)

    return started
  }

  function expired(entryExport: FormEntryExport) {
    rows.remove(entryExport.id)
    toast.add({
      title: 'This export has expired',
      description: 'Exports are kept for 24 hours.',
      color: 'warning',
      icon: 'i-lucide-clock',
      actions: [
        {
          label: 'Export again',
          color: 'neutral',
          variant: 'outline',
          onClick: () => void run(entryExport.id, () => retry(entryExport)),
        },
      ],
    })
  }

  async function download(entryExport: FormEntryExport) {
    await run(entryExport.id, async () => {
      let fresh: FormEntryExport

      try {
        fresh = await fetchExport(entryExport.id)
      } catch (error) {
        if (toApiError(error).status === 404) {
          return expired(entryExport)
        }

        throw error
      }

      if (isExpired(fresh, Date.now())) {
        return expired(fresh)
      }

      rows.update(fresh)

      if (fresh.status !== 'completed' || !fresh.download_url) {
        // Back in the list as in progress, so polling picks it up again.
        toast.add({ title: 'This export is not ready yet.', icon: 'i-lucide-loader-circle' })

        return
      }

      startDownload(fresh.download_url, fresh.filename)
    })
  }

  async function run(id: string, action: () => Promise<unknown>) {
    busy.value = id

    try {
      await action()
    } catch (error) {
      toast.add({ title: toApiError(error).message, color: 'error', icon: 'i-lucide-circle-alert' })
    } finally {
      busy.value = undefined
    }
  }

  return {
    busy,
    download,
    retry: (entryExport: FormEntryExport) => run(entryExport.id, () => retry(entryExport)),
    /** Starts an export without the busy state, for callers that show their own. */
    start: retry,
  }
}

/** A plain link click, so the browser streams the file and shows its own download UI. */
function startDownload(url: string, filename: string) {
  const link = document.createElement('a')

  link.href = url
  link.download = filename
  link.rel = 'noopener'
  document.body.append(link)
  link.click()
  link.remove()
}
