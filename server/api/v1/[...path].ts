import type { H3Event } from 'h3'

/**
 * Authenticated pass-through to The Backend's API: `/api/v1/**` → `{apiBase}/v1/**` with the
 * session's bearer token. Responses (status and JSON body) are relayed unchanged.
 *
 * Account and auth endpoints are not proxied: they change the session too, so they have their own
 * routes under /api/auth.
 */
export default defineEventHandler(async (event) => {
  // Decoded, so encoded dot segments (`%2e%2e`) can't slip past the check and be normalised into
  // `..` by the URL parser when forwarding.
  const path = getRouterParam(event, 'path', { decode: true }) ?? ''

  if (!isProxyablePath(path)) {
    throw createError({ statusCode: 404, message: 'Not found.' })
  }

  const body = ['GET', 'HEAD'].includes(event.method) ? undefined : await readRawBody(event)
  let token = await getApiToken(event)

  if (!token) {
    throw unauthenticated()
  }

  let response = await forward(event, path, token, body)

  if (response.status === 401) {
    token = await getApiToken(event, { forceRefresh: true })

    if (!token) {
      throw unauthenticated()
    }

    response = await forward(event, path, token, body)
  }

  setResponseStatus(event, response.status)

  for (const header of ['content-type', 'retry-after']) {
    const value = response.headers.get(header)

    if (value) {
      setResponseHeader(event, header, value)
    }
  }

  return response.status === 204 ? null : await response.text()
})

function forward(event: H3Event, path: string, token: string, body: string | undefined) {
  const { apiBase } = useRuntimeConfig(event)
  const headers = backendHeaders(event, token)

  if (body !== undefined) {
    headers['Content-Type'] = getRequestHeader(event, 'content-type') ?? 'application/json'
  }

  const encodedPath = path.split('/').map(encodeURIComponent).join('/')

  return fetch(`${apiBase}/v1/${encodedPath}${getRequestURL(event).search}`, {
    method: event.method,
    headers,
    body,
  }).catch(() => {
    throw createError({ statusCode: 502, message: 'The API could not be reached.' })
  })
}

function unauthenticated() {
  return createError({ statusCode: 401, message: 'Unauthenticated.' })
}
