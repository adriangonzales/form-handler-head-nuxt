import { describe, expectTypeOf, it } from 'vitest'
import type {
  FormEntry,
  FormEntryBulkAction,
  FormEntryExport,
  FormEntryQuery,
  FormField,
  FormFieldBody,
  FormListItem,
  FormSettings,
} from '../../shared/types/models'

// Guards the spec fixes the dashboard relies on; fails if a regenerated api.d.ts regresses.
describe('generated API types', () => {
  it('types bulk actions as the nine-value enum', () => {
    expectTypeOf<FormEntryBulkAction>().toEqualTypeOf<
      | 'mark_read'
      | 'mark_unread'
      | 'star'
      | 'unstar'
      | 'mark_spam'
      | 'mark_not_spam'
      | 'delete'
      | 'restore'
      | 'force_delete'
    >()
  })

  it('makes every entry filter optional', () => {
    expectTypeOf<{ filter: { read: 'true' } }>().toExtend<FormEntryQuery>()
  })

  it('types form settings and fields', () => {
    expectTypeOf<FormSettings['domains']>().toEqualTypeOf<string[] | null>()
    expectTypeOf<FormSettings['honeypot_enabled']>().toEqualTypeOf<boolean>()
    expectTypeOf<FormField['rules']>().toEqualTypeOf<string[] | string | undefined>()
  })

  it('includes entry counts on form list items', () => {
    expectTypeOf<FormListItem['entries_count']>().toEqualTypeOf<number>()
    expectTypeOf<FormListItem['unread_entries_count']>().toEqualTypeOf<number>()
    expectTypeOf<FormListItem['spam_entries_count']>().toEqualTypeOf<number>()
  })

  it('accepts a page size on the entry query', () => {
    expectTypeOf<{ per_page: 50 }>().toExtend<FormEntryQuery>()
  })

  it('exposes when the spam check finished', () => {
    expectTypeOf<FormEntry['spam_checked_at']>().toEqualTypeOf<string | null>()
  })

  it('types the spam score as a number', () => {
    expectTypeOf<FormEntry['spam_score']>().toEqualTypeOf<number>()
  })

  it('types export parameters as the filters and sort', () => {
    expectTypeOf<FormEntryExport['parameters']>().toEqualTypeOf<{
      sort?: string
      filter?: { [key: string]: string }
    }>()
  })

  it('lets schema fields in a request leave out label, name and rules', () => {
    expectTypeOf<{ id: string; order: number }>().toExtend<FormFieldBody>()
  })

  it('exposes a nullable signed download url', () => {
    expectTypeOf<FormEntryExport['download_url']>().toEqualTypeOf<string | null>()
  })
})
