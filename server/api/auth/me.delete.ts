import { z } from 'zod'

const bodySchema = z.object({ password: z.string() })

/**
 * Permanently deletes the account and everything it owns, then clears the session. The browser sends
 * the password in the body; the API takes it as a query parameter, so it only appears in that
 * server-to-server request.
 */
export default defineEventHandler(async (event) => {
  const { password } = await readValidatedBody(event, bodySchema.parse)
  const { error, response } = await withApiToken(event, (token) =>
    useBackend(event, token).DELETE('/v1/auth/me', { params: { query: { password } } }),
  )

  if (response.status !== 204) {
    return relayApiError(event, response, error)
  }

  await clearUserSession(event)
  setResponseStatus(event, 204)

  return null
})
