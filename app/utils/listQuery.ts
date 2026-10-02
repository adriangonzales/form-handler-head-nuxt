import type { LocationQuery, LocationQueryRaw } from 'vue-router'

export const pageSizes = [15, 25, 50, 100] as const

export interface ListQueryOptions<F extends string = string> {
  sorts: readonly string[]
  defaultSort: string
  /**
   * Allowed values per filter, keyed by the URL parameter name (`active` → `?active=true`): a list,
   * or a check for free-form values such as dates.
   */
  filters: Record<F, readonly string[] | ((value: string) => boolean)>
  /** Filter values left out of the URL because they're the default (`status=inbox`). */
  defaultFilter?: Partial<Record<F, string>>
  defaultPerPage?: number
}

export interface ListQueryState<F extends string = string> {
  page: number
  perPage: number
  sort: string
  filter: Partial<Record<F, string>>
}

/** Reads list state from the route query, falling back to defaults for anything missing or invalid. */
export function parseListQuery<F extends string>(
  query: LocationQuery,
  options: ListQueryOptions<F>,
): ListQueryState<F> {
  const page = Number(first(query.page))
  const perPage = Number(first(query.per_page))
  const sort = first(query.sort)
  const filter: Partial<Record<F, string>> = {}

  for (const [name, allowed] of Object.entries(options.filters) as [
    F,
    ListQueryOptions<F>['filters'][F],
  ][]) {
    const value = first(query[name]) ?? options.defaultFilter?.[name]

    if (
      value !== undefined &&
      (typeof allowed === 'function' ? allowed(value) : allowed.includes(value))
    ) {
      filter[name] = value
    }
  }

  return {
    page: Number.isInteger(page) && page > 0 ? page : 1,
    perPage: (pageSizes as readonly number[]).includes(perPage)
      ? perPage
      : (options.defaultPerPage ?? pageSizes[0]),
    sort: sort !== undefined && options.sorts.includes(sort) ? sort : options.defaultSort,
    filter,
  }
}

/** The route query for a state, leaving out defaults so URLs stay short. */
export function toRouteQuery<F extends string>(
  state: ListQueryState<F>,
  options: ListQueryOptions<F>,
): LocationQueryRaw {
  const query: LocationQueryRaw = {}

  for (const [name, value] of Object.entries(state.filter) as [F, string | undefined][]) {
    if (value !== undefined && value !== options.defaultFilter?.[name]) {
      query[name] = value
    }
  }

  if (state.sort !== options.defaultSort) {
    query.sort = state.sort
  }

  if (state.perPage !== (options.defaultPerPage ?? pageSizes[0])) {
    query.per_page = String(state.perPage)
  }

  if (state.page > 1) {
    query.page = String(state.page)
  }

  return query
}

/** The API query for a state: Laravel's `page`, `per_page`, `sort` and `filter[…]`. */
export function toApiQuery<F extends string>(
  state: ListQueryState<F>,
): Record<string, string | number> {
  const query: Record<string, string | number> = {
    page: state.page,
    per_page: state.perPage,
    sort: state.sort,
  }

  for (const [name, value] of Object.entries(state.filter) as [F, string | undefined][]) {
    if (value !== undefined) {
      query[`filter[${name}]`] = value
    }
  }

  return query
}

function first(value: LocationQuery[string] | undefined): string | undefined {
  const item = Array.isArray(value) ? value[0] : value

  return typeof item === 'string' ? item : undefined
}
