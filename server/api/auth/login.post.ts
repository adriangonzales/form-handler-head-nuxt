import { z } from 'zod'

const credentialsSchema = z.object({
  email: z.string(),
  password: z.string(),
})

/**
 * Exchanges email and password for an API token, loads the user, and starts the session. The token
 * stays in the sealed cookie's server-only data; the browser only receives the user.
 */
export default defineEventHandler(async (event) => {
  const credentials = await readValidatedBody(event, credentialsSchema.parse)
  const login = await useBackend(event).POST('/v1/auth/login', { body: credentials })

  if (!login.data) {
    // 422 (wrong credentials) and 429 (throttled) carry messages meant for the login form.
    return relayApiError(event, login.response, login.error)
  }

  const tokens = tokenSetFromResponse(login.data)
  const me = await useBackend(event, tokens.token).GET('/v1/auth/me')

  if (!me.data) {
    throw createError({
      statusCode: 502,
      message: 'Signed in, but the account could not be loaded.',
    })
  }

  await startApiSession(event, me.data.data, tokens)

  return { user: me.data.data }
})
