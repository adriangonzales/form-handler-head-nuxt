export type SignedOutReason = 'expired' | 'signed-out' | 'password-reset' | 'account-deleted'

export const signedOutMessages: Record<SignedOutReason, string> = {
  expired: 'Your session has ended. Please sign in again.',
  'signed-out': "You've been signed out.",
  'password-reset': 'Your password has been reset. Sign in with your new password.',
  'account-deleted': 'Your account has been deleted.',
}

/** Signs in through the server route, then loads the new session into `useUserSession()`. */
export async function signIn(credentials: { email: string; password: string }) {
  const { $api } = useNuxtApp()
  const { fetch: loadSession } = useUserSession()

  await $api('/auth/login', { method: 'POST', body: credentials })
  await loadSession()
}

export async function signOut() {
  const { $api } = useNuxtApp()

  // The server route clears the session even if the API is unreachable.
  await $api('/auth/logout', { method: 'POST' }).catch(() => undefined)
  await endSession('signed-out')
}

/** Forgets the session client-side and goes to the login page, remembering where the user was. */
export async function endSession(reason: SignedOutReason) {
  const { session } = useUserSession()
  const route = useRoute()

  session.value = null

  if (route.path === '/login') {
    return
  }

  const redirect = reason === 'expired' ? route.fullPath : undefined

  await navigateTo({ path: '/login', query: { reason, redirect } })
}
