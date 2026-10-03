import type { H3Event } from 'h3'

/**
 * Returns a usable API token for the signed-in user, refreshing it first when it expires within
 * `auth.refreshAheadSeconds`, or when `forceRefresh` is set (after the API answered 401).
 *
 * Returns `null`, and clears the session, when there is no session, the 7-day refresh window has
 * ended, or the API refuses to refresh (expired chain or revoked by a password change). Throws 502
 * when the API cannot be reached, leaving the session intact.
 */
export async function getApiToken(
  event: H3Event,
  { forceRefresh = false }: { forceRefresh?: boolean } = {},
): Promise<string | null> {
  const session = await getUserSession(event)
  const secure = session.secure

  if (!session.user || !secure?.token) {
    return null
  }

  const { auth } = useRuntimeConfig(event)
  const action = tokenAction(secure, {
    now: Date.now(),
    refreshAheadMs: auth.refreshAheadSeconds * 1000,
    forceRefresh,
    wasRefreshed: refreshCoordinator.wasRefreshed(secure.token),
  })

  if (action === 'expired') {
    await clearUserSession(event)

    return null
  }

  if (action === 'use') {
    return secure.token
  }

  let refreshed: TokenSet | null

  try {
    refreshed = await refreshCoordinator.refresh(secure.token, (token) =>
      refreshAtApi(event, token),
    )
  } catch {
    throw createError({ statusCode: 502, message: 'The API could not be reached.' })
  }

  if (!refreshed) {
    await clearUserSession(event)

    return null
  }

  await setUserSession(event, { secure: { ...secure, ...refreshed } })

  return refreshed.token
}

/** Starts a session from a fresh login (or a password change, which starts a new token chain). */
export async function startApiSession(event: H3Event, user: User, tokens: TokenSet) {
  const { session } = useRuntimeConfig(event)

  await replaceUserSession(event, {
    user,
    secure: { ...tokens, refreshableUntil: Date.now() + (session.maxAge ?? 604_800) * 1000 },
  })
}

async function refreshAtApi(event: H3Event, token: string): Promise<TokenSet | null> {
  const { data, response } = await useBackend(event, token).POST('/v1/auth/refresh')

  if (response.status === 401) {
    return null
  }

  if (!data) {
    throw new Error(`Token refresh failed with ${response.status}.`)
  }

  return tokenSetFromResponse(data)
}

/**
 * Calls the API with the session's token, refreshing it and retrying once if the API answers 401.
 * Throws 401 when there's no usable session, so the client sends the user to the login page.
 */
export async function withApiToken<T extends { response: Response }>(
  event: H3Event,
  call: (token: string) => Promise<T>,
): Promise<T> {
  let token = await getApiToken(event)
  let result = token ? await call(token) : undefined

  if (result?.response.status === 401) {
    token = await getApiToken(event, { forceRefresh: true })
    result = token ? await call(token) : undefined
  }

  if (!result || result.response.status === 401) {
    throw createError({ statusCode: 401, message: 'Unauthenticated.' })
  }

  return result
}
