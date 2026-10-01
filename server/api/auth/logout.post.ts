/**
 * Deny-lists the API token, then clears the session whatever the API answered, so signing out
 * always works locally.
 */
export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  const token = session.secure?.token

  if (token && !refreshCoordinator.wasRefreshed(token)) {
    await useLaravel(event, token)
      .POST('/v1/auth/logout')
      .catch(() => undefined)
  }

  await clearUserSession(event)
  setResponseStatus(event, 204)

  return null
})
