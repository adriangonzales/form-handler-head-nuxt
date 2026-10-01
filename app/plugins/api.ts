import { appendResponseHeader } from 'h3'

/**
 * `$api`: `$fetch` for this app's server routes (`/api/**`).
 *
 * - During SSR it forwards the browser's cookies, and passes any `Set-Cookie` the server routes
 *   send (a refreshed session) on to the page response and to later requests in the same render.
 * - A 401 means the session is over: the session state is cleared and the user is sent to the
 *   login page, with a way back to where they were.
 */
export default defineNuxtPlugin((nuxtApp) => {
  const event = import.meta.server ? useRequestEvent() : undefined
  const forwardedHeaders = import.meta.server ? useRequestHeaders(['cookie']) : {}

  const api = $fetch.create({
    baseURL: '/api',
    onRequest({ options }) {
      if (import.meta.server && forwardedHeaders.cookie) {
        const headers = new Headers(options.headers)

        headers.set('cookie', forwardedHeaders.cookie)
        options.headers = headers
      }
    },
    onResponse({ response }) {
      if (!import.meta.server || !event) {
        return
      }

      const setCookies = response.headers.getSetCookie()

      for (const setCookie of setCookies) {
        appendResponseHeader(event, 'set-cookie', setCookie)
      }

      if (setCookies.length > 0) {
        forwardedHeaders.cookie = applySetCookies(forwardedHeaders.cookie ?? '', setCookies)
      }
    },
    async onResponseError({ response }) {
      if (response.status === 401) {
        await nuxtApp.runWithContext(() => endSession('expired'))
      }
    },
  })

  return { provide: { api: api as typeof $fetch } }
})
