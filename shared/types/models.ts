import type { components } from './api'

type Schemas = components['schemas']

export type User = Schemas['UserResource']

export type Form = Schemas['FormResource']
/** A form as returned by the forms list, which always includes the entry counts. */
export type FormListItem = Form &
  Required<Pick<Form, 'entries_count' | 'unread_entries_count' | 'spam_entries_count'>>
/** A list of fields, each with a ULID `id` and an integer `order`. The API returns it sorted by `order`. */
export type FormSchema = NonNullable<Form['schema']>
export type FormField = FormSchema[number]
export type FormSettings = NonNullable<Form['settings']>

// The spec types each request field's `label`, `name` and `rules` as required (but nullable), while
// the API accepts them omitted, as the resource types them. The bodies use the resource's field shape.
type WithSchema<T> = Omit<T, 'schema'> & { schema?: FormSchema | null }

export type FormStoreBody = WithSchema<Schemas['FormStoreRequest']>
export type FormUpdateBody = WithSchema<Schemas['FormUpdateRequest']>

export type FormEntry = Schemas['FormEntryResource']
export type FormEntryUpdateBody = Schemas['FormEntryUpdateRequest']
export type FormEntryQuery = Schemas['FormEntryIndexRequest']
export type FormEntryBulkBody = Schemas['FormEntryBulkRequest']
export type FormEntryBulkAction = FormEntryBulkBody['action']

// `parameters` is typed `string` in the spec, but the API returns the filters and sort the export
// was requested with. The UI reads them to summarise an export and to retry a failed one.
export type FormEntryExport = Omit<Schemas['FormEntryExportResource'], 'parameters'> & {
  parameters: Pick<FormEntryQuery, 'filter' | 'sort'>
}

export type FormNotification = Schemas['FormNotificationResource']
export type FormNotificationStoreBody = Schemas['FormNotificationStoreRequest']
export type FormNotificationUpdateBody = Schemas['FormNotificationUpdateRequest']

/** Laravel's paginated resource collection envelope. */
export interface Paginated<T> {
  data: T[]
  links: { first: string | null; last: string | null; prev: string | null; next: string | null }
  meta: {
    current_page: number
    from: number | null
    last_page: number
    path: string | null
    per_page: number
    to: number | null
    total: number
    links: { url: string | null; label: string; active: boolean }[]
  }
}

/** Laravel's 422 body. */
export interface ValidationErrorBody {
  message: string
  errors: Record<string, string[]>
}
