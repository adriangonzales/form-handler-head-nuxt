import { z } from 'zod'

const bodySchema = z.object({
  token: z.string(),
  email: z.string(),
  password: z.string(),
  password_confirmation: z.string(),
})

/** Sets a new password from an emailed reset token. The user then signs in again. */
export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, bodySchema.parse)
  const { data, error, response } = await useBackend(event).POST('/v1/auth/reset-password', {
    body,
  })

  return data ?? relayApiError(event, response, error)
})
