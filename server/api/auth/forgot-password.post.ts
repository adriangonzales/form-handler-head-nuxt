import { z } from 'zod'

const bodySchema = z.object({ email: z.string() })

/** Asks the API to email a reset link. The API answers the same whether or not the account exists. */
export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, bodySchema.parse)
  const { data, error, response } = await useBackend(event).POST('/v1/auth/forgot-password', {
    body,
  })

  return data ?? relayApiError(event, response, error)
})
