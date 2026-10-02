import type { FormSchema } from '#shared/types/models'
import { ulid } from './ulid'

export interface FormTemplate {
  value: 'blank' | 'contact' | 'newsletter'
  label: string
  description: string
  /** Builds the template's schema, with fresh ULIDs as field IDs. */
  schema: () => FormSchema | null
}

export const formTemplates: readonly FormTemplate[] = [
  { value: 'blank', label: 'Blank', description: 'No fields yet.', schema: () => null },
  {
    value: 'contact',
    label: 'Contact',
    description: 'Name, email and message.',
    schema: () => ({
      [ulid()]: { label: 'Name', name: 'name', rules: ['required', 'max:255'] },
      [ulid()]: { label: 'Email', name: 'email', rules: ['required', 'email', 'max:255'] },
      [ulid()]: { label: 'Message', name: 'message', rules: ['required', 'max:5000'] },
    }),
  },
  {
    value: 'newsletter',
    label: 'Newsletter',
    description: 'Email address only.',
    schema: () => ({
      [ulid()]: { label: 'Email', name: 'email', rules: ['required', 'email', 'max:255'] },
    }),
  },
]
