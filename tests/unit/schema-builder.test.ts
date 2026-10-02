import { describe, expect, it } from 'vitest'
import { isUlid } from '../../app/utils/ulid'
import {
  draftsToSchema,
  newFieldDraft,
  parseRules,
  schemaToDrafts,
  serializeRules,
  slugifyInputName,
  validateDrafts,
} from '../../app/utils/schemaBuilder'

describe('parseRules / serializeRules', () => {
  it('reads presets from an array and keeps unknown rules unchanged', () => {
    const state = parseRules(['required', 'email', 'max:255', 'regex:/^a,b$/', 'in:a,b'])

    expect(state).toMatchObject({
      required: true,
      email: true,
      max: '255',
      oneOf: ['a', 'b'],
      custom: ['regex:/^a,b$/'],
    })
    expect(serializeRules(state)).toEqual([
      'required',
      'email',
      'max:255',
      'in:a,b',
      'regex:/^a,b$/',
    ])
  })

  it('splits string rules on commas, as the API does', () => {
    expect(serializeRules(parseRules('required, numeric,min:2'))).toEqual([
      'required',
      'numeric',
      'min:2',
    ])
  })
})

const nameId = '01k6b8x9qm2v7c4d5e6f7g8h9j'
const emailId = '01k6b8x9qm2v7c4d5e6f7g8h9k'
const topicId = '01k6b8x9qm2v7c4d5e6f7g8h9m'

describe('schema round trip', () => {
  it('keeps ULID keys, order, labels, input names and rules', () => {
    const schema = {
      [nameId]: { label: 'Full name', name: 'full_name', rules: ['required', 'max:255'] },
      [emailId]: { label: 'Email', name: 'contact_email', rules: 'required,email' },
      [topicId]: { name: 'topic', rules: ['in:sales,support', 'nullable'] },
    }

    expect(draftsToSchema(schemaToDrafts(schema))).toEqual({
      [nameId]: { label: 'Full name', name: 'full_name', rules: ['required', 'max:255'] },
      [emailId]: { label: 'Email', name: 'contact_email', rules: ['required', 'email'] },
      [topicId]: { name: 'topic', rules: ['in:sales,support', 'nullable'] },
    })
    expect(Object.keys(draftsToSchema(schemaToDrafts(schema)))).toEqual([nameId, emailId, topicId])
  })

  it('keeps a ULID-keyed field without a name submitting under its ULID', () => {
    const [draft] = schemaToDrafts({ [nameId]: { label: 'Name' } })

    expect(draft!.name).toBe(nameId)
    expect(draftsToSchema([draft!])).toEqual({ [nameId]: { label: 'Name' } })
  })

  it('gives fields with other keys a ULID, keeping the old key as the input name', () => {
    const saved = draftsToSchema(
      schemaToDrafts({ email: { label: 'Email' }, message: { name: 'body' } }),
    )
    const [first, second] = Object.entries(saved)

    expect(Object.keys(saved).every(isUlid)).toBe(true)
    expect(first![1]).toEqual({ label: 'Email', name: 'email' })
    expect(second![1]).toEqual({ name: 'body' })
  })

  it('reads the API’s empty schema `[]` and null as no fields', () => {
    expect(schemaToDrafts([])).toEqual([])
    expect(schemaToDrafts(null)).toEqual([])
  })

  it('reads a list-shaped schema (numeric keys) by index, keeping the index as the input name', () => {
    const [draft] = schemaToDrafts([{ label: 'Zero' }])

    expect(isUlid(draft!.id)).toBe(true)
    expect([draft!.label, draft!.name]).toEqual(['Zero', '0'])
  })
})

describe('newFieldDraft', () => {
  it('starts with a fresh ULID and no input name', () => {
    const first = newFieldDraft()
    const second = newFieldDraft()

    expect(isUlid(first.id)).toBe(true)
    expect(first.id).not.toBe(second.id)
    expect(first).toMatchObject({ label: '', name: '', nameEdited: false, required: false })
  })
})

describe('slugifyInputName', () => {
  it.each([
    ['Email address', 'email_address'],
    ['  Café & crème ', 'cafe_creme'],
    ['2nd phone', 'field_2nd_phone'],
    ['!!!', ''],
  ])('%j → %j', (label, slug) => expect(slugifyInputName(label)).toBe(slug))
})

describe('validateDrafts', () => {
  function draft(name: string, overrides: Partial<ReturnType<typeof newFieldDraft>> = {}) {
    return { ...newFieldDraft(), name, ...overrides }
  }

  it('accepts valid rows, including a legacy ULID input name', () => {
    expect(validateDrafts([draft('email'), draft('phone'), draft(nameId, { id: nameId })])).toEqual(
      {},
    )
  })

  it('requires input names that start with a letter and are unique', () => {
    const missing = draft('')
    const numeric = draft('2')
    const first = draft('email')
    const duplicate = draft('email')
    const errors = validateDrafts([missing, numeric, first, duplicate])

    expect(errors[missing.key]?.name).toBe('Give the field an input name.')
    expect(errors[numeric.key]?.name).toMatch(/Start with a letter/)
    expect(errors[duplicate.key]?.name).toBe('Another field already uses this input name.')
  })

  it('requires whole numbers for min and max', () => {
    const row = draft('age', { min: '1.5', max: 'ten' })

    expect(validateDrafts([row])[row.key]).toEqual({
      min: 'Use a whole number.',
      max: 'Use a whole number.',
    })
  })
})
