# Form Handler Dashboard

The web dashboard for the [Headless Form Handler API](../form-handler-headless-laravel). The API stores forms, accepts submissions from any website and sends alerts, but has no interface of its own. This app is that interface. Account holders use it to:

- define forms and their fields;
- copy the snippet that puts a form on their site, and send test submissions;
- triage entries (read, star, spam, trash) and export them as CSV;
- choose who gets alerted by email or SMS;
- manage their own account.

Built with Nuxt 4 (SSR), Nuxt UI 4 and nuxt-auth-utils. [`PLAN.md`](PLAN.md) covers the architecture and milestones, and [`docs/prds`](docs/prds/README.md) has the requirements for each area.

## How it fits together

```
Browser ──(sealed session cookie)──▶ Nuxt server ──(Bearer JWT)──▶ Laravel API /api/v1
   ├──▶ API directly: public form submissions (the test-submit tool)
   └──▶ API directly: signed CSV download links
```

The API's JWT never reaches the browser. It's kept in a sealed, httpOnly session cookie. The Nuxt server adds it to every API call (`server/api/v1/[...path].ts`) and refreshes it shortly before it expires. Sessions last as long as the API's refresh window (7 days by default), after which the user signs in again.

## Requirements

- Node 22 and pnpm 10 (`corepack enable` picks up the pinned version)
- The API running locally (see its README). Its queue worker has to run too: exports, spam checks, user-agent parsing and alerts are all queued.

## Setup

```bash
pnpm install
cp .env.example .env
```

Then edit `.env`:

| Variable                            | What it's for                                                                                                                                                               |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NUXT_API_BASE`                     | The API base, e.g. `http://localhost:8000/api`. Only the Nuxt server calls it. **Use the API's public origin**: the API builds signed download links from the host it sees. |
| `NUXT_PUBLIC_API_PUBLIC_BASE`       | The API base as browsers reach it. Shown in embed snippets and used by the test-submit tool.                                                                                |
| `API_DOCS_URL`                      | Where `pnpm api:types` fetches the OpenAPI spec. Defaults to `NUXT_API_BASE` with `/api` replaced by `/docs/api.json`.                                                      |
| `NUXT_SESSION_PASSWORD`             | Seals the session cookie, at least 32 characters. Generated in dev if empty; **required in production**.                                                                    |
| `NUXT_SESSION_MAX_AGE`              | Session lifetime in seconds. Keep it equal to the API's `JWT_REFRESH_TTL` × 60.                                                                                             |
| `NUXT_PUBLIC_PASSWORD_REQUIREMENTS` | The password rules shown on the Account page. Match the API's rules for the environment.                                                                                    |
| `E2E_EMAIL`, `E2E_PASSWORD`         | The account the Playwright tests sign in as.                                                                                                                                |
| `E2E_API_DIR`                       | The API's directory. The Account tests create throwaway users there with `php artisan user:create`.                                                                         |

There's no sign-up. Create accounts in the API:

```bash
cd ../form-handler-headless-laravel
php artisan user:create --name="Ada Lovelace" --email=ada@example.com
```

Password reset emails link to the API's `PASSWORD_RESET_URL`, which defaults to `http://localhost:3000/reset-password`, this app's dev URL.

## Development

```bash
pnpm dev          # http://localhost:3000
```

In the API's directory, run the server and the queue worker alongside it:

```bash
php artisan serve
php artisan queue:work
```

| Command          | What it does                                                                |
| ---------------- | --------------------------------------------------------------------------- |
| `pnpm check`     | Lint, Prettier check, typecheck and unit tests. Run it before every commit. |
| `pnpm test`      | Unit tests (Vitest)                                                         |
| `pnpm test:e2e`  | End-to-end tests (Playwright); see below                                    |
| `pnpm api:types` | Regenerates `shared/types/api.d.ts` from the API's OpenAPI spec             |
| `pnpm lint:fix`  | ESLint with fixes                                                           |
| `pnpm format`    | Prettier                                                                    |

### API types

Every call to the API is typed from its OpenAPI spec. After the API changes, run `pnpm api:types`, then `pnpm typecheck`: anything the change breaks shows up as a type error. `shared/types/models.ts` gives the generated types short names (`Form`, `FormEntry`, …) and fixes the few places the spec is wrong (listed in `PLAN.md`).

### End-to-end tests

The Playwright tests run against the real API. Before running them:

1. Start the API and its queue worker (`php artisan serve`, `php artisan queue:work`).
2. Create the test user in the API, and set `E2E_EMAIL` and `E2E_PASSWORD` in `.env`. The tests expect that user to be named `E2E Test User`.
3. Install the browser once: `pnpm exec playwright install chromium`.

```bash
pnpm test:e2e
pnpm test:e2e tests/e2e/journey.spec.ts   # just the end-to-end happy path
```

The suite starts its own dev server on port 3100, with token refresh forced on every request, so it never clashes with `pnpm dev`. Each test creates its own forms and deletes them afterwards.

- `journey.spec.ts` walks the happy path through every area, from sign-in to sign-out, using the UI only.
- `accessibility.spec.ts` scans every screen with axe for WCAG 2.1 AA in light and dark mode and at 375 px wide. It also checks keyboard navigation and modal focus.
- The other specs cover one area each: auth, forms, fields, entries, exports, notifications, account.

## Project layout

```
app/
  pages/          one file per route; /forms/[id] has child routes for its tabs
  components/     grouped by area: forms/, entries/, exports/, notifications/, account/
  composables/    data access (useForms, useEntries, useExports, …) and shared behaviour
  utils/          pure functions, unit tested: schema builder, snippets, filters, 422 mapping
server/
  api/auth/       login, logout, me, password, password reset
  api/v1/         the authenticated proxy to the API
  utils/          session handling and the shared token refresh
shared/types/     generated API types and their short names
tests/unit/       Vitest
tests/e2e/        Playwright
```

## Deploying

`pnpm build` produces a Node server in `.output/` (`node .output/server/index.mjs`). Set the `NUXT_*` variables from the table above in its environment.

- `NUXT_SESSION_PASSWORD` must be set and stay the same across restarts and instances, or everyone is signed out.
- If the server reaches the API through an internal address, it must send `X-Forwarded-Host` and `X-Forwarded-Proto` for the API's public host, or download links will point at the internal one.
- Add the Nuxt server to the API's `TRUSTED_PROXIES`. Otherwise the API's per-IP login throttle counts every user as one.
- Token refreshes are coordinated in memory, so the app assumes a single server process. Running several instances needs a shared lock (see the open questions in `PLAN.md`).
