/**
 * Deny-lists the API token, then clears the session whatever the API answered, so signing out
 * always works locally.
 */
export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  const token = session.secure?.token

  if (token) {
    // If another request already refreshed this token, the API no longer accepts it, but the token
    // that refresh produced is live (and may be in the browser's cookie by now). Revoke that.
    const refreshed = await refreshCoordinator.refreshedTo(token)

    await useLaravel(event, refreshed?.token ?? token)
      .POST('/v1/auth/logout')
      .catch(() => undefined)
  }

  await clearUserSession(event)
  setResponseStatus(event, 204)

  return null
})
