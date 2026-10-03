/** Reloads the signed-in user from the API and stores it in the session. */
export default defineEventHandler(async (event) => {
  const me = await withApiToken(event, (token) => useBackend(event, token).GET('/v1/auth/me'))

  if (!me.data) {
    throw createError({ statusCode: 502, message: 'The account could not be loaded.' })
  }

  await setUserSession(event, { user: me.data.data })

  return { user: me.data.data }
})
