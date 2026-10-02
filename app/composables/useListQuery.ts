/**
 * List state (page, page size, sort, filters) kept in the URL, so views can be shared, bookmarked
 * and restored with back/forward. The page size chosen last is remembered per list in
 * localStorage and applied when the URL doesn't set one.
 */
export function useListQuery<F extends string>(key: string, options: ListQueryOptions<F>) {
  const route = useRoute()
  const router = useRouter()
  const storageKey = `fh:per-page:${key}`

  const state = computed(() => parseListQuery(route.query, options))
  const apiQuery = computed(() => toApiQuery(state.value))

  function update(patch: Partial<ListQueryState<F>>) {
    // Changing anything other than the page starts again from page 1.
    const next = { ...state.value, page: 1, ...patch }

    if (patch.perPage !== undefined) {
      try {
        localStorage.setItem(storageKey, String(patch.perPage))
      } catch {
        // Storage unavailable: the URL still carries the choice.
      }
    }

    return router.push({ query: toRouteQuery(next, options) })
  }

  onMounted(() => {
    if (route.query.per_page !== undefined) {
      return
    }

    let stored: number

    try {
      stored = Number(localStorage.getItem(storageKey))
    } catch {
      return
    }

    if ((pageSizes as readonly number[]).includes(stored) && stored !== state.value.perPage) {
      void router.replace({ query: toRouteQuery({ ...state.value, perPage: stored }, options) })
    }
  })

  return { state, apiQuery, update }
}
