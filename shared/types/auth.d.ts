import type { User as ApiUser } from './models'

declare module '#auth-utils' {
  // The session's user is the API's user resource, so `useUserSession().user` is fully typed.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface User extends ApiUser {}

  // Only readable in server/ routes: nuxt-auth-utils strips `secure` from /api/_auth/session.
  interface SecureSessionData {
    /** The API's JWT. Never sent to the browser. */
    token: string
    /** When `token` expires (ms since epoch). */
    expiresAt: number
    /** When the API stops allowing refreshes of this login's token chain (ms since epoch). */
    refreshableUntil: number
  }
}

export {}
