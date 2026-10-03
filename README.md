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
| `E2E_CREATE_USER_CMD`               | A shell command that creates a test user, for the Playwright tests and the contract suite. See [Tests against a backend](#tests-against-a-backend).                         |

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

| Command                   | What it does                                                                    |
| ------------------------- | ------------------------------------------------------------------------------- |
| `pnpm dev:mock`           | Development server against the mock backend (no API needed)                     |
| `pnpm mock:backend`       | Just the mock backend, on `127.0.0.1:8010`                                      |
| `pnpm check`              | Lint, Prettier check, typecheck and unit tests. Run it before every commit.     |
| `pnpm test`               | Unit tests (Vitest)                                                             |
| `pnpm test:contract`      | Checks the API at `NUXT_API_BASE` against the contract                          |
| `pnpm test:e2e`           | End-to-end tests (Playwright); starts a dev server unless `E2E_BASE_URL` is set |
| `pnpm test:contract:mock` | The contract suite against a fresh mock backend (no API needed)                 |
| `pnpm test:e2e:mock`      | The Playwright tests against a fresh mock backend (no API needed)               |
| `pnpm api:types`          | Regenerates `shared/types/api.d.ts` and `openapi.json` from the API's spec      |
| `pnpm lint:fix`           | ESLint with fixes                                                               |
| `pnpm format`             | Prettier                                                                        |

### API types

Every call to the API is typed from its OpenAPI spec. After the API changes, run `pnpm api:types`, then `pnpm typecheck`: anything the change breaks shows up as a type error. `shared/types/models.ts` gives the generated types short names (`Form`, `FormEntry`, …) and fixes the few places the spec is wrong (listed in `PLAN.md`).

## Tests against a backend

`pnpm test:contract` and the Playwright tests call a real backend. The contract's public checks need only `NUXT_API_BASE`.

The checks that sign in need test users, and the contract has no sign-up endpoint. So `E2E_CREATE_USER_CMD` is a shell command that creates a user, with `{name}`, `{email}` and `{password}` replaced. For the reference API:

```sh
E2E_CREATE_USER_CMD="cd ../form-handler-headless-laravel && php artisan user:create --name={name} --email={email} --password={password} --no-interaction"
```

`.env.example` has the equivalent for the mock backend. Tests delete their users afterwards through the API.

Before running the Playwright tests against the reference API, start its server and queue worker (`php artisan serve`, `php artisan queue:work`): exports, spam checks and user-agent parsing are queued. Install the browser once with `pnpm exec playwright install chromium`.

```bash
pnpm test:e2e
pnpm test:e2e tests/e2e/journey.spec.ts   # just the end-to-end happy path
```

The suite starts its own dev server on port 3100 (`E2E_PORT`), with token refresh forced on every request, so it never clashes with `pnpm dev` and the refresh path is always exercised. It creates its own user for the run and deletes it afterwards, and each test creates its own forms and deletes them.

- `journey.spec.ts` walks the happy path through every area, from sign-in to sign-out, using the UI only.
- `accessibility.spec.ts` scans every screen with axe for WCAG 2.1 AA in light and dark mode and at 375 px wide. It also checks keyboard navigation and modal focus.
- The other specs cover one area each: auth, forms, fields, entries, exports, notifications, account.

## The mock backend

`tests/mocks/backend/` is an in-memory implementation of [the contract](docs/backend-contract.md), built with MSW and sharing no code with the reference API. It covers every endpoint the dashboard uses. It also has mock-only helpers:

- `POST /__mock/users` creates a user;
- `POST /__mock/notifications/{id}/bounce` records a delivery problem on a recipient;
- `GET /__mock/alerts` lists the alerts it has "sent".

`pnpm dev:mock` runs the dashboard against it (port 8010); sign in as `demo@example.com` / `password`.

`pnpm test:contract:mock` and `pnpm test:e2e:mock` run the contract suite and the Playwright tests against a fresh mock on port 8011 (`MOCK_BACKEND_PORT`). They override `.env` where it would point elsewhere, and need no API or test-user command. CI (`.github/workflows/ci.yml`) runs `pnpm check` and both suites this way on every push and pull request. Both suites pass against the mock and against the reference API, which is the evidence that the dashboard depends on the contract rather than on either implementation.

The mock is a copy of the Next.js dashboard's (`../form-handler-head-next/tests/mocks/backend/`), as are the contract suite and `docs/backend-contract.md`. Change them in both projects.

## Using another backend

The dashboard works with any backend that implements [the contract](docs/backend-contract.md). To switch to one:

1. **Check the contract.** Run `NUXT_API_BASE=https://new-backend.example/api pnpm test:contract`. Without a test-user command, only the public checks run (endpoints, guest 401s, error shapes). Set `E2E_CREATE_USER_CMD` to a shell command that creates a user on the new backend, and the signed-in checks run too. Fix the backend until all of them pass.
2. **Regenerate the types.** Run `API_DOCS_URL=https://new-backend.example/docs/api.json pnpm api:types`, then `pnpm typecheck`. A type error shows where the new spec differs from the old one. `git diff shared/types/api.d.ts` shows the whole change.
3. **Adapt, if a convention differs.** `docs/backend-contract.md` names the module that relies on each convention. A unit test (`tests/unit/backend-independence.test.ts`) fails if code or tests name a backend framework.
4. **Configure.** Point `NUXT_API_BASE` and `NUXT_PUBLIC_API_PUBLIC_BASE` at the new backend, and set `NUXT_SESSION_MAX_AGE` and `NUXT_PUBLIC_PASSWORD_REQUIREMENTS` to match its policy. On the backend, set the reset-email link, the trusted proxy and its public origin, as listed under [Deploying](#deploying).
5. **Run the end-to-end tests** with `pnpm test:e2e`, using the same `E2E_CREATE_USER_CMD`, and with any background workers the backend needs (exports must complete).

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
scripts/          type generation, the mock backend's server and the wrappers that run tests against it
tests/unit/       Vitest
tests/contract/   the backend contract suite (Vitest)
tests/mocks/      the mock backend
tests/e2e/        Playwright
```

## Deploying

`pnpm build` produces a Node server in `.output/` (`node .output/server/index.mjs`). Set the `NUXT_*` variables from the table above in its environment.

- `NUXT_SESSION_PASSWORD` must be set and stay the same across restarts and instances, or everyone is signed out.
- If the server reaches the API through an internal address, it must send `X-Forwarded-Host` and `X-Forwarded-Proto` for the API's public host, or download links will point at the internal one.
- Add the Nuxt server to the API's `TRUSTED_PROXIES`. Otherwise the API's per-IP login throttle counts every user as one.
- Token refreshes are coordinated in memory, so the app assumes a single server process. Running several instances needs a shared lock (see the open questions in `PLAN.md`).
