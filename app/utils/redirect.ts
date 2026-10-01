/**
 * Returns `target` when it is a same-site path, otherwise `fallback`, so a `?redirect=` value can't
 * send the user to another site (`//evil.example`, `https://…`, `/\evil.example`).
 */
export function safeRedirect(target: unknown, fallback = '/forms'): string {
  if (typeof target !== 'string' || !target.startsWith('/') || target.startsWith('//')) {
    return fallback
  }

  if (target.includes('\\') || /\p{Cc}/u.test(target)) {
    return fallback
  }

  return target
}
