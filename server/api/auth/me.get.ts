/** Reloads the signed-in user from the API and stores it in the session. */
export default defineEventHandler(async (event) => {
  let token = await getApiToken(event)
  let me = token ? await useLaravel(event, token).GET('/v1/auth/me') : undefined

  if (me?.response.status === 401) {
    token = await getApiToken(event, { forceRefresh: true })
    me = token ? await useLaravel(event, token).GET('/v1/auth/me') : undefined
  }

  if (!me?.data) {
    throw createError({ statusCode: 401, message: 'Unauthenticated.' })
  }

  await setUserSession(event, { user: me.data.data })

  return { user: me.data.data }
})
