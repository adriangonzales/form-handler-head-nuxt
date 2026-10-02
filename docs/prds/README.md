# Product Requirements — Form Handler Dashboard (Nuxt)

These documents describe the dashboard for the Headless Form Handler API, as of 2026-10-01. They were updated the same day for the API's page sizes, entry counts, spam classification, `spam_checked_at`, and the export index. They come from [`PLAN.md`](../../PLAN.md) and the API's own PRDs (`../form-handler-headless-laravel/docs/prds`).

They started as forward-looking targets, one milestone each. All nine milestones are now built, and each PRD's **Status** line and requirements describe what was actually built. When a feature changes, update its PRD to match.

## Product summary

The API is headless: it stores forms, accepts public submissions, and alerts recipients, but it has no interface. This dashboard is that interface for account holders. In it they:

- sign in;
- define forms and their fields;
- get the snippet to put a form on their site;
- triage incoming entries and export them;
- choose who gets alerted;
- manage their account.

## Documents

| PRD                                                         | Scope                                                                                                         | Milestone |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------- |
| [App Shell & Architecture](app-shell-and-architecture.md)   | Nuxt server proxy, configuration, layout, navigation, shared UI behaviour, error handling, API types, tooling | 1, 2, 9   |
| [Authentication & Session](authentication-and-session.md)   | Login, logout, forgot/reset password, the session cookie, token refresh, route protection                     | 2         |
| [Forms](forms.md)                                           | Forms list, create, settings, activate/deactivate, delete/restore, duplicate                                  | 3         |
| [Form Fields & Integration](form-fields-and-integration.md) | Schema builder, embed snippets, test submission                                                               | 4         |
| [Entries](entries.md)                                       | Entry inbox, filters, detail view, triage, bulk actions, trash                                                | 5         |
| [Entry Exports](entry-exports.md)                           | Queued CSV export, status polling, signed download, recent exports and the Exports page                       | 6         |
| [Notifications](notifications.md)                           | Email/SMS alert recipients and delivery errors                                                                | 7         |
| [Account](account.md)                                       | Profile, password change, account deletion                                                                    | 8         |

Milestone 9 (polish, accessibility, end-to-end coverage, README) has no PRD of its own. Its requirements are the acceptance criteria and non-functional requirements in each document.

## System at a glance

```
Browser ──(sealed session cookie)──▶ Nuxt / Nitro server ──(Bearer JWT)──▶ Laravel API /api/v1
   │                                   • /api/auth/*      login, logout, me, password reset
   │                                   • /api/v1/**       authenticated pass-through proxy
   │
   ├──▶ Laravel API directly: public form submissions (test-submit tool)
   └──▶ Laravel API directly: signed CSV download links
```

- **Stack:** Nuxt 4 (SSR), Nuxt UI 4 (Tailwind 4), nuxt-auth-utils, openapi-typescript + openapi-fetch, zod, Vitest, Playwright. TypeScript 5 and pnpm 10, both pinned.
- **Auth model:** the JWT never reaches browser JavaScript. It lives in a sealed, httpOnly session cookie, and the Nuxt server attaches it to API calls and refreshes it.
- **API contract:** types are generated from the API's OpenAPI spec (`pnpm api:types`) into `shared/types/api.d.ts`, with short names in `shared/types/models.ts`.
- **Identifiers:** forms, entries, notifications and exports use ULID strings. Users use integers.
- **Pagination:** list endpoints return 15 items per page by default, with Laravel's `links`/`meta`. The forms and entries lists accept `per_page` from 1 to 100; the notifications list is fixed at 15.
- **Spam:** the API classifies every public submission with an AI spam check (Jev) after storing it, and sends alerts only after that check. Entries can therefore move into Spam shortly after they arrive. `spam_checked_at` records when the check finished, and stays null while it's pending or if it couldn't run.

## Cross-cutting status

| Capability                                                                                    | Status                                                                            |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Project scaffold, config from `.env`, generated API types, lint/format/typecheck/test tooling | Built (milestone 1)                                                               |
| Login, session, token refresh, route protection, password reset                               | Built (milestone 2)                                                               |
| Form management                                                                               | Built (milestone 3)                                                               |
| Schema builder, embed snippets, test submit                                                   | Built (milestone 4)                                                               |
| Entry inbox and triage                                                                        | Built (milestone 5)                                                               |
| CSV export                                                                                    | Built (milestone 6)                                                               |
| Notification recipients                                                                       | Built (milestone 7)                                                               |
| Account self-service                                                                          | Built (milestone 8)                                                               |
| Accessibility (WCAG 2.1 AA scan), end-to-end happy path, README                               | Built (milestone 9)                                                               |
| Sign-up                                                                                       | **Not planned.** The API has no registration; accounts are created by an operator |
| Email verification, MFA                                                                       | **Not planned.** The API doesn't support them                                     |

## Conventions used in these PRDs

- **FR-x:** a functional requirement the dashboard must satisfy. Each is the unit to build and test against.
- **NFR-x:** a non-functional requirement (security, performance, accessibility).
- **AC:** acceptance criteria that close the milestone.
- **API dependency:** API behaviour the requirement relies on, linked to the API PRD.
- **Gap:** something users would expect that the API doesn't support yet, so the dashboard can't offer it.
- **Open question:** a product decision that isn't settled.

API PRDs are cited as, for example, _API Forms FR-4_. They live in `../form-handler-headless-laravel/docs/prds/`.
