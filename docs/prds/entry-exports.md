# PRD: Entry Exports

**Status:** Built (milestone 6, 2026-10-01) · **Owner area:** `app/components/entries/ExportButton.vue`, `app/components/exports/` (`ExportList`, `ExportStatus`, `ExportActions`), `app/pages/exports.vue`, `app/composables/useExports.ts`, `app/utils/exports.ts`

## 1. Summary

Users can download a form's entries as a CSV. The API builds exports in the background: the dashboard starts an export, polls until it's ready, then gives the user a link. The link is a short-lived signed URL that the browser downloads straight from the API. No credentials are involved, and the file doesn't pass through the Nuxt server.

Exports are kept for 24 hours, and the API lists them. Recent exports can therefore be found and downloaded again from any device: on the form's Entries tab, and on an account-wide **Exports** page.

## 2. Users

- **Account holder:** takes entries into a spreadsheet or another system.

## 3. Goals

- Export exactly what the user is looking at: the same filters and sort as the entries table.
- Never hold a request open while a large export runs.
- Downloads work as ordinary browser downloads, with progress and the browser's own save dialog.
- Recent exports can be downloaded again without re-running them, even from another session or device.

## 4. Functional requirements

**FR-1 Start an export.**

- **Export CSV** on the Entries tab sends `POST /v1/forms/{id}/entries/exports` with the current `filter` and `sort`. It never sends `page` or `per_page`: the API ignores `per_page` for exports, and an export always contains every matching entry.
- On 202 the Exports popover (FR-6) opens with the new export at the top, showing "Preparing export…".
- **Export CSV** stays enabled while an export runs, because exports are independent. But it warns if an export with the same filters and sort is already `pending` or `processing`.

**FR-2 Poll status.**

- Poll `GET /v1/entry-exports/{export}` for each of the user's `pending` or `processing` exports that's on screen, every 2 s, backing off to every 10 s after 30 s, until `status` is `completed` or `failed`.
- Polling stops when no in-progress export is on screen. Because the index (FR-6, FR-7) always shows the current state, an export started elsewhere, or before a reload, is picked up again from there. Nothing needs to be kept in browser storage.
- While polling, the row shows `pending` / `processing`.

**FR-3 Download.**

- A `completed` export shows "{row_count} entries" and a **Download** button.
- Clicking it fetches the export again (`GET /v1/entry-exports/{id}`) for a fresh signed `download_url`, then starts the download with a plain navigation. That's an `<a href download>` click, not a `fetch`, so the browser streams the file itself.
- The signed URL expires a few minutes after it's issued (`EXPORT_DOWNLOAD_URL_TTL`, default 5). The `download_url` in an index response is never used directly, because it may already be stale; every click re-fetches.

**FR-4 Failures.**

- `failed`: show the export's `error` (for example "the form was deleted"), with **Try again**. That starts a new export with the same `filter` and `sort`, read from the export's `parameters`.
- The download returns 409: "This export is not ready." Resume polling.
- The download returns 410, or the export returns 404: the export has expired. Remove it from the list and offer **Export again**.
- The download returns 403: the signature expired between fetching and clicking. Re-fetch once and retry automatically.

**FR-5 What's in the file.**

- The popover explains:
  - the export reflects entries matching the filters when it runs, not when it was requested;
  - columns follow the current schema plus any older fields;
  - dates are in UTC;
  - it includes a `spam_checked_at` column.
- The filename comes from the API: `{form-slug}-entries-{date}.csv`.

**FR-6 Recent exports on the Entries tab.**

- An **Exports** button next to Export CSV opens a popover listing this form's recent exports, newest first.
- Each row shows:
  - when the export was requested;
  - a summary of its filters and sort, from `parameters` (for example "Unread · newest first", or "All entries");
  - its status;
  - its row count;
  - when it expires (relative, for example "expires in 3 h");
  - **Download** or **Try again**.
- The button shows a badge while any of this form's exports are in progress.
- The index has no per-form filter, so the popover loads `GET /v1/entry-exports?per_page=100` and keeps the rows whose `form_id` matches. With 24-hour retention, 100 rows covers the account's recent exports in practice. If the response has more than one page, the popover links to the Exports page for the rest. See Gaps.

**FR-7 Exports page.**

- `/exports`, linked from the sidebar, lists all of the user's exports across forms (`GET /v1/entry-exports`), newest first. It's paginated, with a page-size selector of 15, 25, 50 or 100, kept in the URL.
- Columns:
  - **form:** the form's name, linking to its Entries tab. The name comes from the forms list, loaded once and cached for the session. It falls back to the export's `filename` if the form isn't found;
  - **filters:** summarised as in FR-6;
  - **requested**;
  - **status**;
  - **rows**;
  - **expires**;
  - **actions:** Download, or Try again.
- In-progress rows are polled as in FR-2.
- The empty state explains that exports are started from a form's Entries tab and kept for 24 hours.
- The API leaves out expired exports and exports of deleted forms, so the page never shows rows that can't be downloaded.

## 5. Non-functional requirements

- **NFR-1:** the download URL points at the API's public origin. This relies on the proxy calling the API by its public URL, or forwarding the host headers ([App Shell](app-shell-and-architecture.md) FR-4).
- **NFR-2:** the CSV never streams through Nitro. The dashboard never has the file's contents in memory.
- **NFR-3:** polling is limited to exports in progress on screen, and stops when the page or popover isn't visible (`document.visibilityState`).

## 6. Acceptance criteria

- **AC-1:** with the Starred filter on, the exported CSV contains only starred entries, in the table's order.
- **AC-2:** let more than 5 minutes pass after the export completes, then click Download. The file downloads, because the link was re-fetched.
- **AC-3:** a failed export shows its error, and Try again starts a new export with the same filters.
- **AC-4:** start an export, reload the page, and sign in from a second browser. The export is listed in both, with its live status, and can be downloaded from either.
- **AC-5:** the Exports page lists exports from two forms with the right form names. An export of a deleted form doesn't appear.
- **AC-6 (e2e):** export, download, and check that the file's header row matches the schema labels.

## 7. API dependencies

_API Entries_ FR-8:

- 202 with `Location`;
- statuses `pending` → `processing` → `completed` | `failed`;
- the signed `download_url`, valid for `EXPORT_DOWNLOAD_URL_TTL`;
- 403 for a bad or expired signature, 409 when not ready, 410 when expired;
- 24-hour retention;
- the CSV column order (including `spam_checked_at`), and formula-injection protection;
- `GET /v1/entry-exports`: the user's exports across all forms, newest first, `per_page` 1–100 with a default of 15, leaving out expired exports and those of deleted forms.

## 8. Gaps

- **The export index can't be filtered by form.** The Entries tab filters the first 100 exports client-side (FR-6). A `filter[form]` parameter, or `GET /v1/forms/{form}/entries/exports`, would remove that limit.
- **Exports don't include the form's name**, only `form_id`. The Exports page joins them against the forms list.
- **A 403 from the download link can't be detected.** The download is a plain link click, so the dashboard never sees the response. Download re-fetches the export immediately before clicking, so the link is minutes from expiring at worst; FR-4's automatic retry on 403 isn't implemented.
- **Polling continues while the popover is closed** (but not while the tab is hidden), so the Exports badge and the "Export ready" toast stay current. NFR-3 is met for hidden tabs only.
- **`parameters` is mistyped in the spec** (`string`, when it's an object holding `filter` and `sort`). `models.ts` overrides it as `Pick<FormEntryQuery, 'filter' | 'sort'>`, because the dashboard reads it for the filter summary and Try again. The override can go once the spec is fixed.

## 9. Open questions

1. Should the API add a form filter to the export index, and include the form name in the export resource?
2. Should users be able to delete an export before it expires? The API has no delete endpoint.
