# PRD: Entries

**Status:** Built (milestone 5, 2026-10-01; Export CSV comes with milestone 6) · **Owner area:** `app/pages/forms/[id]/entries.vue`, `app/pages/forms/[id]/entries/[entryId].vue`, `app/utils/entries.ts`, `app/components/entries/EntryFilters.vue`, `app/components/entries/EntryBulkBar.vue`, `app/components/entries/EntryDetail.vue`, `app/composables/useEntries.ts`

## 1. Summary

Entries are submissions to a form. The **Entries** tab is an inbox for one form. Users can:

- read submissions and see where they came from;
- mark them read or unread;
- star the important ones;
- flag or clear spam;
- delete entries, restore them from trash, or erase them permanently, one at a time or in bulk.

## 2. Users

- **Account holder:** triages submissions to their forms.

## 3. Goals

- See new submissions first and know at a glance which haven't been read.
- Triage dozens of entries quickly with bulk actions.
- Be able to erase a submitter's personal data permanently when asked.

## 4. Functional requirements

**FR-1 Entries table.** `/forms/[id]/entries` (the form's default tab) lists entries, 15 per page by default. A page-size selector offers 15, 25, 50 or 100 (`per_page`).

- **Columns:**
  - a selection checkbox;
  - an unread indicator;
  - a star toggle;
  - received time;
  - one column per schema field, in schema order, headed by its label;
  - a spam badge, with the spam likelihood (FR-9) in its tooltip.
- **Cell values:** each field column shows that field's value, truncated. Lists are joined with `, ` and other structured values are shown as compact JSON. Empty values show `—`.
- **Extra keys:** input keys that aren't in the current schema (removed or renamed fields) are left out of the table, but shown in the detail view under "Other fields".
- **Unread rows** are bold and carry the unread indicator, so the state isn't shown by colour alone.
- **Empty state:** links to the Integrate tab.

**FR-2 Default order.** Newest first (`sort=-created_at`). The API's own default is oldest first (_API Entries FR-2_), so the dashboard always sends `sort`. The user can switch to oldest first, or to spam score (high to low, or low to high).

**FR-3 Filters.**

- **Status tabs**, kept in the URL as `?status=inbox|unread|starred|spam|trash` (default `inbox`). The forms list links to `?status=unread` and `?status=spam`:
  - **Inbox:** not spam, not deleted (`filter[spam]=false`);
  - **Unread:** `filter[read]=false&filter[spam]=false`;
  - **Starred:** `filter[starred]=true`;
  - **Spam:** `filter[spam]=true`;
  - **Trash:** `filter[trashed]=only`.
- **Tab counts:** Inbox, Unread and Spam show their totals as badges. When the user arrives from the forms list, the counts come from that form's list item (`entries_count`, `unread_entries_count`, `spam_entries_count`). After any triage action, or when arriving directly, each badge is refreshed with a `per_page=1` request for that tab, reading `meta.total`. Starred and Trash don't show counts.
- **Date range:** sets `filter[created_from]` and `filter[created_to]`, which are inclusive whole UTC days. The picker says the dates are in UTC.
- Filters, sort, page and page size live in the URL (`useListQuery`). Changing a filter or the page size resets to page 1.
- A 422 on a filter (for example an end date before the start date) shows inline on the date picker.

**FR-4 Entry detail.** Clicking a row opens the entry (`/forms/[id]/entries/[entryId]`, shown as a slide-over on wide screens and a page on narrow ones). It shows:

- every schema field, with its label and full value;
- "Other fields" for keys not in the schema;
- the received time, in the user's local time with UTC in a tooltip;
- the IP address(es), the referer (shown as text, not a clickable link), and the parsed user agent (platform, browser, version) with the raw user agent in a disclosure. The parsed user agent can be `null` just after submission while the API parses it in the background; show "Parsing…" and the raw string;
- the spam state, likelihood and reason (FR-9);
- **previous/next** controls that move through the current filtered, sorted list, loading the adjacent page when needed.

**FR-5 Mark read on open.**

- Opening an unread entry sends `PATCH /v1/entries/{id}` with `read_at` set to now, and updates the row.
- The detail view has **Mark as unread** (`read_at: null`).

**FR-6 Single-entry actions.**

- **Star / Unstar:** `starred`.
- **Mark as spam / Not spam:** `spam`.
- **Delete:** `DELETE /v1/entries/{id}`, with an Undo toast that calls `/restore`.
- In Trash: **Restore**, and **Delete permanently** (`DELETE /v1/entries/{id}/force`, with confirmation).

**FR-7 Bulk actions.**

- Selecting rows shows a bulk bar with the count and the actions that apply in the current tab:
  - **Inbox, Unread, Starred and Spam:** Mark read, Mark unread, Star, Unstar, Mark spam, Not spam, Delete;
  - **Trash:** Restore, Delete permanently (with confirmation).
- Selection is limited to the current page. **Select all on this page** works at any page size, because the largest page (100) matches the API's 100-ID bulk limit.
- Each action sends `POST /v1/forms/{id}/entries/bulk` with `{action, ids}`.
- **Result:** the toast reports `affected` from the response (for example "3 entries starred"). Entries that were already in that state aren't counted, so the number can be lower than the selection. The list then refreshes and the selection clears.
- A 422 on `ids.N` (an entry changed state in the meantime) shows "Some entries changed. Refresh and try again." and refreshes the list.

**FR-8 Export.** The toolbar has **Export CSV**, which exports using the current filters and sort. See [Entry Exports](entry-exports.md).

**FR-9 Automatic spam classification.** After each public submission the API checks it for spam in the background. It's an AI classifier (Jev): entries scored at a 0.9 likelihood or above are flagged, with the reason "Jev classified this entry as spam." Alerts are only sent after the check (_API Entries FR-1a_). The dashboard reflects this as follows:

- **Likelihood:** `spam_score` is a probability from 0 to 1, serialised as a number (`0.95`). It's shown as a percentage ("95% likely spam"), not a raw score. Sorting by spam score sorts by this likelihood.
- **Check state (`spam_checked_at`):**
  - **Checked:** `spam_checked_at` is set. The detail view shows "Checked {time}" next to the likelihood. Honeypot hits are marked checked when they arrive, with the honeypot reason and no likelihood shown.
  - **Checking:** `spam_checked_at` is null and the entry is less than 2 minutes old. The row shows a subtle "Checking…" badge, and the detail view says the entry may still move to Spam and that alerts go out once the check finishes.
  - **Not checked:** `spam_checked_at` is null and the entry is older than that. The classifier was unavailable or the call failed. The entry stays in Inbox, alerts were still sent, and the detail view shows "Not checked for spam" with no likelihood, rather than a misleading 0%.
  - The 2-minute window is a client-side heuristic, set in app config. The API doesn't say whether a check is still queued.
- **Entries that move to Spam:**
  - A new entry starts out not spam, and can move to Spam seconds later when the check finishes.
  - While any row on the page is **Checking**, the list refreshes every 10 s (stopping once none are left, or after 2 minutes), so flagged entries leave Inbox without a manual reload.
  - An open detail view polls that entry on the same schedule, and shows a toast if it gets flagged.
  - The Inbox, Unread and Spam count badges refresh with the list.
- **Overriding the classifier:** the user can always flag an entry as **Not spam**, or flag a missed one as **Spam**. A manual change isn't reclassified.

## 5. Non-functional requirements

- **NFR-1 Untrusted content:** entry data comes from anonymous submitters and must be treated as hostile. Every value (inputs, referer, user agent, spam reason) is rendered as text with Vue's default escaping. Never use `v-html`, Markdown rendering or automatic links. A test submits `<img src=x onerror=alert(1)>` and `javascript:` URLs, and checks they render as plain text.
- **NFR-2:** a page of 15 entries with 20 fields each renders without layout shift. The table scrolls horizontally inside its container.

## 6. Acceptance criteria

- **AC-1:** a new test submission appears at the top of Inbox and Unread, in bold. Opening it marks it read.
- **AC-2:** bulk-star 3 entries, one of them already starred. The toast says 2.
- **AC-3:** delete an entry and Undo. Delete it again, then permanently delete it from Trash. It's gone from every tab.
- **AC-4:** filters and sort survive a reload. Previous/next in the detail view follow them.
- **AC-5:** NFR-1's hostile payloads are shown as text.
- **AC-6:** an entry the classifier flagged shows in Spam with its likelihood and reason. **Not spam** moves it back to Inbox and updates the Inbox, Unread and Spam counts.
- **AC-7:** at page size 100, Select all, then a bulk action, succeeds.
- **AC-8:** with no classifier key configured on the API, a new entry shows "Checking…" and then "Not checked for spam", and stays in Inbox. With the key set, an entry the classifier flags leaves Inbox within about 10 s, without a reload.

## 7. API dependencies

_API Entries_ FR-1a (Jev spam classification, threshold 0.9, `spam_checked_at`, alerts after the check), FR-2 (list, sort, filters, `per_page` 1–100 with a default of 15, oldest-first default), FR-3/FR-4 (show and update; submission fields are read-only), FR-5 (response shape: `spam_score` is a number, `user_agent_display` an object or null), FR-6 (delete, restore, force delete only for deleted entries), FR-7 (bulk actions and `affected`). Entries of a deleted form return 403.

## 8. Gaps

- **No IP geolocation:** `ip_location_display` is always null, so the detail view doesn't show it.
- **No full-text search over entries:** the API has no search filter.
- **Deleted entries can't be fetched one at a time:** `GET /v1/entries/{id}` returns 404 for an entry in Trash, so the detail view shows the list's copy of the row there. A link to a deleted entry that isn't on the current page shows "Entry not found".
- **Entries checked on arrival have a score of 0:** honeypot hits and entries added through the API are marked checked when they're created, without a classifier score. The dashboard treats a 0 score checked within a second of arrival as "no likelihood" rather than 0%.

## 9. Open questions

1. Should selection span pages ("select all 240 matching"), sending bulk requests in batches of 100?
2. Should spam be hidden from Inbox by default, as planned, or shown with a badge?
3. Should the API tell a queued spam check apart from one that failed (for example a `spam_check_status`), so the dashboard doesn't need the 2-minute heuristic?
