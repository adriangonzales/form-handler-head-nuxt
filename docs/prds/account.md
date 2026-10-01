# PRD: Account

**Status:** Planned (milestone 8) · **Owner area:** `app/pages/account.vue`, `server/api/auth/password.put.ts`, `server/api/auth/me.patch.ts`, `server/api/auth/me.delete.ts`

## 1. Summary

The **Account** page lets a signed-in user update their name and email, change their password, and permanently delete their account and everything it owns. These calls go through dedicated Nuxt server routes, not the generic proxy, because they change the session as well as calling the API.

## 2. Users

- **Account holder:** manages their own account. There are no admin features.

## 3. Goals

- Keep profile changes simple, and say plainly what side effects they have.
- A password change must not log the user out of the session they made it from.
- Account deletion is hard to do by accident and impossible to misunderstand.

## 4. Functional requirements

**FR-1 Profile.**

- Name (max 255) and email (max 255), saved with `PATCH /v1/auth/me`.
- The session's user is updated from the response, so the header reflects the change straight away.
- Changing the email shows a notice first: it clears the address's verified status (_API Auth FR-10_).
- A 422 on `email` (already taken) shows on the field.

**FR-2 Change password.**

- Current password, new password and confirmation. `PUT /api/auth/password` calls `PUT /v1/auth/password`.
- The API revokes every token, including the current one, and returns a new one. The server route stores the new token and `expiresAt` in the session, so the user stays signed in here.
- `refreshableUntil` is reset to now plus the refresh window, because the new token starts a new refresh chain.
- A notice says other browsers and devices are signed out.
- **Errors:** a wrong current password shows on `current_password`; password-policy failures show on `password` with the API's message.
- **Requirements text:** "at least 12 characters with upper- and lower-case letters, numbers and symbols, and not a known breached password" in production, or 8 characters elsewhere. The text comes from config, so it can match the API environment.

**FR-3 Delete account.**

- A danger-zone section lists exactly what's deleted:
  - all forms, including deleted ones;
  - their entries;
  - their notification recipients;
  - their exports.
- It says the deletion is permanent.
- **Delete account** opens a confirmation modal that asks for the current password. The confirm button stays disabled until the user types their email.
- It calls `DELETE /v1/auth/me` with `password`. On 204 the server route clears the session and the user lands on `/login` with "Your account has been deleted."
- A wrong password shows a 422 on the password field, and nothing is deleted.

## 5. Non-functional requirements

- **NFR-1:** passwords are only ever sent to Nuxt server routes over HTTPS in production. They're never logged, and never kept in client state after submission.

## 6. Acceptance criteria

- **AC-1:** change the name, and the header updates without a reload.
- **AC-2:** change the password. This session keeps working; a second browser's session is signed out on its next request.
- **AC-3:** deleting the account with the wrong password changes nothing. With the right one, the user lands on `/login`, and the old credentials no longer work.

## 7. API dependencies

_API Auth_ FR-10 (profile; changing the email clears verification), FR-11 (password change revokes all tokens and returns a new one), FR-12 (password policy), FR-13 (account deletion and what it removes).

## 8. Gaps

- **No email verification flow**, so the verified state that changing the email clears is never set again.
- **No active-sessions list, and no "log out other sessions"** without changing the password.

## 9. Open questions

1. Should the account page show `email_verified_at` at all, given nothing in the product uses or sets it?
