# PRD: Authentication & Session

**Status:** Built (milestone 2, 2026-10-01). The emailed reset link hasn't been verified end to end yet · **Owner area:** `server/api/auth/*`, `server/utils/api-session.ts`, `server/utils/refresh-coordinator.ts`, `app/plugins/api.ts`, `app/composables/useAuth.ts`, `server/api/v1/[...path].ts`, `app/middleware/auth.global.ts`, `app/pages/login.vue`, `app/pages/forgot-password.vue`, `app/pages/reset-password.vue`, nuxt-auth-utils

## 1. Summary

Account holders sign in with email and password. The Nuxt server exchanges those credentials for an API JWT and keeps the token in a sealed, httpOnly session cookie that browser JavaScript can't read. It attaches the token to every proxied API call and refreshes it before it expires. The session ends when the user logs out, when the API's 7-day refresh window runs out, or when the token is revoked by a password change.

## 2. Users

- **Account holder:** signs in, stays signed in across reloads and tabs, signs out, recovers a forgotten password.
- **Operator:** creates accounts with `php artisan user:create`. There is no sign-up in the dashboard.

## 3. Goals

- No credential that can be used against the API is ever exposed to browser JavaScript.
- Users aren't interrupted while the session is valid: refresh happens on the server, without the user noticing.
- When a session can't continue, the user lands on the login page with a clear reason, and returns to where they were after signing in.

## 4. Functional requirements

**FR-1 Log in.**

- `/login` has email and password fields. On submit, `POST /api/auth/login` (Nuxt) calls the API's `POST /v1/auth/login`, then `GET /v1/auth/me`.
- It stores `{ user, token, expiresAt, refreshableUntil }` in the session with `setUserSession`:
  - `expiresAt` is now plus the API's `expires_in`;
  - `refreshableUntil` is login time plus `NUXT_SESSION_MAX_AGE`.
- On success the user goes to the `redirect` query parameter if it's a same-site path, and to `/forms` otherwise.
- **Errors:**
  - 422 shows the API's message on the email field ("These credentials do not match our records.");
  - 429 shows the throttle message, which says how many seconds remain.
- The page says that accounts are created by an administrator. There's no sign-up link.

**FR-2 Current user.** `GET /api/auth/me` returns the session's user. The default layout shows the user's name. The user is reloaded from the API after a profile update ([Account](account.md) FR-1).

**FR-3 Log out.**

- **Log out** calls `POST /api/auth/logout`. That calls the API's `POST /v1/auth/logout` to deny-list the token, then clears the session, whatever the API returned.
- If another request has already refreshed the session's token, the API no longer accepts it, but the token that refresh produced is live and may already be in the browser's cookie. Logout revokes that newest token instead (following the refresh coordinator's chain). **Fixed 2026-10-03:** logout used to skip revoking in this case, leaving the newer token valid until it expired.
- The user lands on `/login`. Other open tabs find out on their next request (401 → login).

**FR-4 Route protection.**

- `auth.global.ts` sends unauthenticated visitors to `/login?redirect=<path>` from every route except `/login`, `/forgot-password` and `/reset-password`.
- Signed-in users who visit `/login` go to `/forms`.
- The check runs during SSR, so protected pages are never rendered for guests.

**FR-5 Token refresh.** The proxy ([App Shell](app-shell-and-architecture.md) FR-3) refreshes the token in two cases:

- **Before expiry:** when `expiresAt` is less than 2 minutes away, it calls `POST /v1/auth/refresh` first and saves the new token and `expiresAt`.
- **After a 401:** it refreshes once and retries the original request once. If the refresh or the retry fails, it clears the session and returns 401.

Refreshing deny-lists the old token, so refreshes must never overlap:

- `RefreshCoordinator` keeps one in-flight refresh per old token, so concurrent requests share a single refresh and all use the new token.
- For 60 s after a refresh, requests still carrying the old token reuse its result instead of sending the deny-listed token. This covers a browser that hasn't received the new cookie yet, and SSR renders that forward the original cookie.
- During SSR, the `$api` plugin copies `Set-Cookie` from API calls onto the page response, so a refresh made while rendering reaches the browser.
- A refresh that fails because the API is unreachable returns 502 and keeps the session. Only a 401 from the API ends it.

**FR-6 Session expiry.**

- The session cookie's `maxAge` equals the API's refresh window (`NUXT_SESSION_MAX_AGE` = 604800 s = 7 days, matching `JWT_REFRESH_TTL`).
- Refreshing doesn't extend `refreshableUntil`, because the API anchors the refresh window to the original login (_API Auth FR-4_).
- After `refreshableUntil`, the proxy clears the session without calling the API and returns 401. The login page then says "Your session has expired. Please sign in again."

**FR-7 Revoked tokens.**

- If the API rejects a refresh as revoked (password changed elsewhere, or reset), the session is cleared and the login page says the session ended.
- The proxy can't tell this apart from an expired refresh window, so both show the same message.

**FR-8 Forgot password.**

- `/forgot-password` takes an email and calls `POST /v1/auth/forgot-password` through `POST /api/auth/forgot-password`.
- It always shows the API's neutral message ("If an account exists for that email, a password reset link has been sent."), and nothing that reveals whether the account exists.
- 429 shows the throttle message.

**FR-9 Reset password.**

- `/reset-password?token=…&email=…` is the page the API's reset email links to (`PASSWORD_RESET_URL`). It shows the email read-only, with new password and confirmation fields.
- It calls `POST /v1/auth/reset-password`. On success it goes to `/login` with a "Password reset. Sign in with your new password." notice.
- 422 on `email` (invalid or expired token) shows the error with a link back to `/forgot-password`.
- Password-policy errors appear on the password field.
- If `token` or `email` is missing, the page shows "This reset link is incomplete" and the forgot-password link.

## 5. Non-functional requirements

- **NFR-1:** the session cookie is `HttpOnly`, `SameSite=Lax`, and `Secure` in production. The token is never in any client-visible payload, including `useUserSession().user`. Only the user resource is exposed.
- **NFR-2:** login, logout, and forgot/reset password are server routes. The browser never calls the API's auth endpoints directly.
- **NFR-3:** the `redirect` parameter only accepts relative paths starting with a single `/`, so it can't be used as an open redirect.
- **NFR-4:** auth forms are disabled until the page hydrates (`useHydrated`). Before hydration, a native submit would send the fields, including the password, as a GET query.
- **NFR-5:** the Nuxt server forwards the browser's IP to the API in `X-Forwarded-For`. The API's per-IP login and reset throttles only see it if the Nuxt server is in the API's `TRUSTED_PROXIES`. Otherwise every user shares the Nuxt server's limit, which for forgot-password is 6 per minute.

## 6. Acceptance criteria

- **AC-1:** after logging in, a hard reload keeps the user signed in.
- **AC-2:** with `JWT_TTL=1` on the API, the user keeps working past a minute and no request fails, because the refresh happened on the server.
- **AC-3:** firing 10 requests in parallel when the token is about to expire calls `/v1/auth/refresh` exactly once.
- **AC-4:** a session past `refreshableUntil` is logged out cleanly with the expiry message (unit-tested with a mocked clock).
- **AC-5:** the reset link from the API's email works end to end, and the user can then sign in with the new password.
- **AC-6:** the JWT doesn't appear in `document.cookie`, in page HTML, or in any `/api/**` response body.

## 7. API dependencies

_API Auth_ FR-1 (login), FR-2 (throttling), FR-4 (refresh and the 7-day window measured from the original login), FR-5 (logout), FR-6 (me), FR-8 (revocation), FR-12 (password reset, `PASSWORD_RESET_URL`, 6/min throttle).

## 8. Gaps

- **No sign-up, email verification or MFA:** the API doesn't support them.
- **No "log out everywhere":** a user can only revoke other sessions by changing their password.

## 9. Open questions

1. Should the login page offer "remember me"? Today every session lasts up to the full 7-day window.
2. If production runs more than one Nitro instance, the refresh lock needs shared storage (KV or Redis). Which host will it be?
