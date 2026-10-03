import { z } from 'zod'

const bodySchema = z.object({
  current_password: z.string(),
  password: z.string(),
  password_confirmation: z.string(),
})

/**
 * Changes the password. The API revokes every token, this session's included, and returns a new
 * one; storing it keeps this browser signed in. The new token starts a new refresh chain, so the
 * session's refresh window starts again too. Other browsers are signed out on their next request.
 */
export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, bodySchema.parse)
  const session = await getUserSession(event)
  const { data, error, response } = await withApiToken(event, (token) =>
    useBackend(event, token).PUT('/v1/auth/password', { body }),
  )

  if (!data) {
    return relayApiError(event, response, error)
  }

  if (!session.user) {
    throw createError({ statusCode: 401, message: 'Unauthenticated.' })
  }

  await startApiSession(event, session.user, tokenSetFromResponse(data))
  setResponseStatus(event, 204)

  return null
})
