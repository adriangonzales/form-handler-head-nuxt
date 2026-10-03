import { describe, expect, it } from 'vitest'
import { toApiError, toFormErrors } from '../../app/utils/apiErrors'

describe('toApiError', () => {
  it('reads a 422 body', () => {
    const error = {
      statusCode: 422,
      data: {
        message: 'These credentials do not match our records.',
        errors: { email: ['These credentials do not match our records.'] },
      },
    }

    expect(toApiError(error)).toEqual({
      status: 422,
      message: 'These credentials do not match our records.',
      errors: { email: ['These credentials do not match our records.'] },
    })
  })

  it('explains a network failure', () => {
    expect(toApiError(new TypeError('fetch failed'))).toMatchObject({
      status: 0,
      message: expect.stringContaining('Could not reach the server'),
      errors: {},
    })
  })

  it('ignores malformed errors', () => {
    expect(toApiError({ statusCode: 500, data: { errors: 'nope' } }).errors).toEqual({})
  })
})

describe('toFormErrors', () => {
  it('splits errors between known fields and other messages', () => {
    const result = toFormErrors({ 'settings.honeypot_name': ['Taken.'], 'ids.3': ['Changed.'] }, [
      'settings.honeypot_name',
    ])

    expect(result).toEqual({
      fieldErrors: [{ name: 'settings.honeypot_name', message: 'Taken.' }],
      otherMessages: ['Changed.'],
    })
  })
})

describe('toFormErrors with list fields', () => {
  it('assigns an error on a list item to the list field', () => {
    expect(
      toFormErrors({ 'settings.domains.1': ['Not a hostname.'] }, ['settings.domains']).fieldErrors,
    ).toEqual([{ name: 'settings.domains', message: 'Not a hostname.' }])
  })
})
