import { z } from 'zod'

const bodySchema = z.object({
  name: z.string().optional(),
  email: z.string().optional(),
})

/** Updates the user's name or email, and the session's copy of the user, so the UI shows it at once. */
export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, bodySchema.parse)
  const { data, error, response } = await withApiToken(event, (token) =>
    useBackend(event, token).PATCH('/v1/auth/me', { body }),
  )

  if (!data) {
    return relayApiError(event, response, error)
  }

  await setUserSession(event, { user: data.data })

  return { user: data.data }
})
