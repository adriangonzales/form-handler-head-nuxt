import { describe, expect, it } from 'vitest'
import { applySetCookies } from '../../app/utils/cookies'

describe('applySetCookies', () => {
  it('replaces a cookie that a response just set and keeps the others', () => {
    expect(
      applySetCookies('theme=dark; nuxt-session=old', [
        'nuxt-session=new=value; Path=/; HttpOnly; SameSite=Lax',
      ]),
    ).toBe('theme=dark; nuxt-session=new=value')
  })

  it('adds a cookie that was not sent', () => {
    expect(applySetCookies('', ['nuxt-session=abc; Path=/'])).toBe('nuxt-session=abc')
  })
})
