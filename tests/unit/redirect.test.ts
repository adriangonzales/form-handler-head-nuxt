import { describe, expect, it } from 'vitest'
import { safeRedirect } from '../../app/utils/redirect'

describe('safeRedirect', () => {
  it.each(['/forms', '/forms/01J9/entries?filter%5Bread%5D=false', '/account'])(
    'keeps the same-site path %s',
    (path) => expect(safeRedirect(path)).toBe(path),
  )

  it.each([
    undefined,
    '',
    'forms',
    '//evil.example',
    'https://evil.example',
    '/\\evil.example',
    '/forms\n',
    ['/forms'],
  ])('falls back for %j', (value) => expect(safeRedirect(value)).toBe('/forms'))
})
