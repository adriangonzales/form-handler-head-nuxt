/**
 * Applies `Set-Cookie` headers to a `Cookie` request header, so later SSR requests in the same
 * render forward the cookies a previous response just set (e.g. a refreshed session).
 */
export function applySetCookies(cookieHeader: string, setCookies: readonly string[]): string {
  const cookies = new Map<string, string>()

  for (const part of cookieHeader.split(';')) {
    const [name, ...value] = part.trim().split('=')

    if (name) {
      cookies.set(name, value.join('='))
    }
  }

  for (const setCookie of setCookies) {
    const [pair = ''] = setCookie.split(';')
    const [name, ...value] = pair.trim().split('=')

    if (name) {
      cookies.set(name, value.join('='))
    }
  }

  return [...cookies].map(([name, value]) => `${name}=${value}`).join('; ')
}
