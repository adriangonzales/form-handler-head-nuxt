import { describe, expect, it } from 'vitest'
import { notificationSchema, tidyPhoneNumber } from '../../app/utils/notifications'

function valueError(type: 'email' | 'sms', value: string) {
  const result = notificationSchema.safeParse({ type, value, enabled: true })

  return result.success
    ? undefined
    : result.error.issues.find((issue) => issue.path[0] === 'value')?.message
}

describe('notificationSchema', () => {
  it('accepts valid recipients', () => {
    expect(valueError('email', 'alerts@example.com')).toBeUndefined()
    expect(valueError('sms', '+14155552671')).toBeUndefined()
    expect(valueError('sms', '+447700900123')).toBeUndefined()
  })

  it('rejects an invalid email', () => {
    expect(valueError('email', 'not-an-email')).toBe('Enter a valid email address.')
    expect(valueError('email', '')).toBe('Enter a recipient.')
  })

  it('asks for E.164 SMS numbers, as the API does', () => {
    expect(valueError('sms', '415-555-2671')).toMatch(/Start with \+ and the country code/)
    expect(valueError('sms', '+1 415 555 2671')).toMatch(/digits only/)
    expect(valueError('sms', '+0123456')).toMatch(/international format/)
    expect(valueError('sms', '+1234567890123456')).toMatch(/international format/)
  })
})

describe('tidyPhoneNumber', () => {
  it('drops separators and turns 00 into +', () => {
    expect(tidyPhoneNumber(' +1 (415) 555-2671 ')).toBe('+14155552671')
    expect(tidyPhoneNumber('0044 7700.900.123')).toBe('+447700900123')
  })

  it("doesn't guess a country code", () => {
    expect(tidyPhoneNumber('415-555-2671')).toBe('4155552671')
  })
})
