import type { H3Event } from 'h3'
import createClient from 'openapi-fetch'
import type { paths } from '#shared/types/api'

/**
 * Typed client for the Laravel API, used by the auth routes. Forwards the browser's IP so the API's
 * per-IP throttles (login, password reset) apply per user rather than to this server; the API only
 * honours it when this server is listed in its TRUSTED_PROXIES.
 */
export function useLaravel(event: H3Event, token?: string) {
  const { apiBase } = useRuntimeConfig(event)

  return createClient<paths>({
    baseUrl: apiBase,
    headers: laravelHeaders(event, token),
  })
}

export function laravelHeaders(event: H3Event, token?: string): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  const ip = getRequestIP(event, { xForwardedFor: true })

  if (ip) {
    headers['X-Forwarded-For'] = ip
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  return headers
}

/** Relays an API error response (422, 429, …) to the browser unchanged. */
export function relayApiError(event: H3Event, response: Response, body: unknown): unknown {
  setResponseStatus(event, response.status)

  const retryAfter = response.headers.get('retry-after')

  // Laravel's throttle sends seconds.
  if (retryAfter && Number.isFinite(Number(retryAfter))) {
    setResponseHeader(event, 'Retry-After', Number(retryAfter))
  }

  return body ?? { message: response.statusText }
}

/** Builds the session's token data from an API token response. */
export function tokenSetFromResponse(body: { access_token: unknown; expires_in: number }) {
  if (typeof body.access_token !== 'string') {
    throw createError({ statusCode: 502, message: 'The API returned no token.' })
  }

  return { token: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 }
}
