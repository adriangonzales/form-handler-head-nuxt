# PRD: App Shell & Architecture

**Status:** Partially built. The scaffold, configuration, API types and tooling are built (milestone 1); the proxy, layouts and shared UI are planned · **Owner area:** `nuxt.config.ts`, `server/api/v1/[...path].ts`, `server/utils/*`, `app/layouts/*`, `app/error.vue`, `app/composables/useApi.ts`, `app/utils/apiErrors.ts`, `shared/types/*`, `scripts/generate-api-types.mjs`

## 1. Summary

This PRD covers the foundation every feature builds on:

- the Nuxt server that sits between the browser and the API;
- how configuration reaches it;
- the generated API types;
- the page chrome (layouts, navigation);
- the behaviour every screen shares: loading, errors, toasts, confirmation of destructive actions, and mapping validation errors onto fields.

## 2. Users

- **Account holder:** uses every screen.
- **Developer:** runs, configures and extends the app.

## 3. Goals

- Keep API credentials out of browser JavaScript.
- Make every API call typed against the live OpenAPI spec, so API changes surface as type errors.
- Give every screen the same, predictable feedback for loading, success, validation errors and failures.

## 4. Functional requirements

**FR-1 Configuration from environment (built).**

- `nuxt.config.ts` reads `NUXT_API_BASE` (server-only API base), `NUXT_PUBLIC_API_PUBLIC_BASE` (the base shown in embed snippets and used by the test-submit tool) and `NUXT_SESSION_MAX_AGE` from `.env`.
- The same variables override these values at runtime in production.
- `NUXT_SESSION_PASSWORD` seals the session cookie, and nuxt-auth-utils generates one in dev if it's missing.
- `.env.example` documents every variable.

**FR-2 Generated API types (built).**

- `pnpm api:types` loads `.env` and writes `shared/types/api.d.ts`. It fetches the spec from `API_DOCS_URL`, or derives it from `NUXT_API_BASE` (`…/api` → `…/docs/api.json`).
- `shared/types/models.ts` gives the API types short names (`Form`, `FormEntry`, `FormEntryExport`, …) and adds the `Paginated<T>` and `ValidationErrorBody` shapes.
- `tests/unit/models.test.ts` asserts the shapes the dashboard depends on, and the typecheck enforces them, so a regenerated spec that regresses fails `pnpm typecheck`.

**FR-3 Authenticated API proxy.**

- `server/api/v1/[...path].ts` forwards any `/api/v1/**` request (method, query, JSON body) to `{apiBase}/v1/**` with `Authorization: Bearer` taken from the session.
- It returns the API's status code and JSON body unchanged, so 401/403/404/409/410/422 reach the page as the API sent them.
- Token refresh and session expiry rules are in [Authentication & Session](authentication-and-session.md) FR-5 and FR-6.
- Requests without a session get 401 without calling the API.

**FR-4 The API base must be the public origin.**

- The proxy calls the API through its public URL, because the API builds signed export links from the host it sees ([Entry Exports](entry-exports.md)).
- If production routes server-to-server traffic through an internal address, the proxy must send `X-Forwarded-Host` and `X-Forwarded-Proto` instead. The API trusts these headers (`config/trustedproxy.php`).

**FR-5 Typed client.** Pages call the proxy through `useApi()`, a typed wrapper whose paths, params and bodies come from the generated types. Server code calls Laravel through an `openapi-fetch` client (`server/utils/laravel.ts`).

**FR-6 Layouts and navigation.**

- `auth` layout: a centred card for login, forgot-password and reset-password.
- `default` layout:
  - a sidebar with **Forms**, **Exports** (with a badge while any export is in progress; see [Entry Exports](entry-exports.md) FR-7) and **Account**;
  - a header with the signed-in user's name and a **Log out** action;
  - the colour-mode toggle;
  - a collapsible sidebar at mobile widths.
- `/` redirects to `/forms`.

**FR-7 Form tabs.** `/forms/[id]` has the tabs **Entries** (default), **Fields**, **Settings**, **Notifications** and **Integrate**. Each tab is its own route, so it can be linked to and survives a reload. The form's name and active badge stay visible above the tabs.

**FR-8 Loading states.** Lists and detail views show skeletons while loading. Buttons that trigger a change show a loading state and are disabled until the request settles, which prevents double submission.

**FR-9 Toasts.**

- Every successful change shows a short success toast.
- Failures other than 422 show an error toast with the API's `message`.
- Destructive actions that can be undone (deleting a form, entry or recipient) offer **Undo** in the toast, which calls the matching `restore` endpoint.

**FR-10 Confirmation.** Actions that can't be undone use a shared confirmation modal that names what will be lost: permanently deleting entries, deleting the account. Deletes that can be undone (FR-9) don't ask for confirmation.

**FR-11 Validation errors.** `utils/apiErrors.ts` maps a 422 body (`errors: { "field.path": [..] }`) onto `UForm` field errors, including nested paths such as `settings.honeypot_name` and `ids.3`. Errors with no matching field go in an alert at the top of the form.

**FR-12 Error pages.**

- `error.vue` renders 403 ("You don't have access to this"), 404 ("Not found"), and a generic error page with a way back to `/forms`.
- A 401 from the proxy at any point sends the user to `/login?redirect=<current path>`.

**FR-13 Rate limiting.** A 429 shows the API's message, without retrying automatically.

## 5. Non-functional requirements

- **NFR-1 Security:**
  - The JWT never appears in browser-visible responses, `document.cookie` or client JavaScript.
  - Submitted entry data is always rendered as text, never with `v-html`. See [Entries](entries.md) NFR-1.
- **NFR-2 Typing:** strict TypeScript. `pnpm typecheck` covers `app/`, `server/`, `shared/` and `tests/`.
- **NFR-3 Quality gate:** `pnpm check` (lint, Prettier check, typecheck, unit and Nuxt tests) passes on every change.
- **NFR-4 Accessibility:**
  - Every interactive control can be reached and operated with the keyboard and has an accessible name.
  - Focus moves into modals and returns to the trigger when they close.
  - Colour isn't the only signal for state (read/unread, spam, errors).
- **NFR-5 Responsiveness:** usable down to 375 px wide. Wide tables scroll horizontally inside their container, never the whole page.
- **NFR-6 Theming:** light and dark mode through Nuxt UI colour mode. Primary colour `indigo`, neutral `zinc` (`app.config.ts`).

## 6. Acceptance criteria

- **AC-1 (built):** `pnpm dev` serves the app on :3000, `pnpm check` passes, and `pnpm api:types` regenerates the types from the URL configured in `.env`.
- **AC-2:** a 422 from any form puts each error on its field; a 404 shows the not-found page; a 401 sends the user to `/login` with a redirect back.
- **AC-3:** the authenticated layout works at 375 px and with the keyboard alone.

## 7. API dependencies

- Errors use Laravel's shapes: 422 `{message, errors}`, and `{message}` for 401/403/404/409/410/429.
- Every response is JSON, including errors. Guests are never redirected (_API Auth FR-3_).

## 8. Open questions

1. Which Nitro preset and host will run in production? That decides whether the per-session refresh lock can stay in memory or needs shared storage (see [Authentication & Session](authentication-and-session.md)).
