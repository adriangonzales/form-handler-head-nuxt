# PRD: Form Fields & Integration

**Status:** Built (milestone 4, 2026-10-01) · **Owner area:** `app/pages/forms/[id]/fields.vue`, `app/pages/forms/[id]/integrate.vue`, `app/components/forms/SchemaFieldRow.vue`, `app/components/forms/TestSubmit.vue`, `app/components/CodeBlock.vue`, `app/utils/schemaBuilder.ts`, `app/utils/snippets.ts`

## 1. Summary

A form's fields are defined in its `schema`: a list of fields, each with a ULID `id`, an integer `order`, and an optional label, input name and Laravel validation rules. The API validates submissions against it. **Field IDs are always ULIDs**: the API requires it (changed 2026-10-01), and the dashboard generates them; the input name is the human-readable part.

```json
[
  {
    "id": "01k6b8x9qm2v7c4d5e6f7g8h9j",
    "order": 1,
    "label": "Name",
    "name": "name",
    "rules": ["required"]
  },
  {
    "id": "01k6b8x9qm2v7c4d5e6f7g8h9k",
    "order": 2,
    "label": "Email",
    "name": "email",
    "rules": ["required", "email"]
  }
]
```

The API rejects a field with any other key, a missing or non-ULID `id`, a repeated `id`, or a missing or non-integer `order` (422). It returns fields sorted by `order`.

- The **Fields** tab is a visual editor for that schema.
- The **Integrate** tab turns the schema into copy-and-paste code for the user's website, and has a test form for sending a real submission.

## 2. Users

- **Account holder / developer:** defines what a form accepts, then wires it into a site.

## 3. Goals

- Define fields and validation without writing JSON or knowing Laravel's rule syntax for common cases, while still allowing any rule.
- Go from "new form" to "working form on my site" by copying one snippet.
- Check that a form works before going live.

## 4. Functional requirements

### Fields tab

**FR-1 Field list.** `/forms/[id]/fields` shows the schema as an ordered list of rows. Each row has:

- **Field ID:** the field's `id`, a ULID (lowercase, like the API's own IDs). It's generated when the field is added and never edited. It's shown read-only under the row, with a copy button.
- **Label:** optional. Shown in entries and alert emails, falling back to the ID.
- **Input name:** required. It's the `name` the site's input must use, and the key submitted values are stored under. It follows the label (`Email address` → `email_address`, made unique with `_2`) until it's typed by hand. It must start with a letter, then use letters, digits, `_` and `-`, and be unique within the form. It's always saved as `name`, because the API's default (the field ID) would be the ULID.
- **A field without a `name`** (saved by another client) keeps submitting under its ID, which is shown as its input name, so the site's form, existing entries and exports carry on working.
- **Rules:** see FR-2.

**FR-2 Rules editor.**

- Toggles and inputs for common rules: **Required**, **Email**, **Numeric**, **URL**, **Max length / value** (`max:N`), **Min** (`min:N`), and **One of** (`in:a,b,c`, entered as tags).
- A **custom rules** text field for any other Laravel rule.
- Rules are always saved as an array, e.g. `["required", "email", "max:255"]`. Either an array or a comma-separated string is accepted when reading.
- Rules the presets don't recognise go into the custom field, unchanged.

**FR-3 Edit, add, remove and reorder.** Fields can be added, removed, and reordered by drag and drop, or with move-up/move-down buttons for keyboard users. Rows are shown sorted by each field's `order`. On save, `order` is renumbered 1, 2, 3… to match the order on screen, so the saved list is also in display order.

**FR-4 Save.**

- **Save** sends `PUT /v1/forms/{id}` with the current `name`, `active` and the serialised `schema`: one `{ id, order, label?, name?, rules? }` per row, leaving out an empty label, empty rules, and a `name` equal to the ID (the API's default).
- A 422 on `schema` (for example a field's input name clashing with the honeypot name) shows above the list.
- The page warns before the user leaves with unsaved changes.

**FR-5 Empty schema.**

- The builder treats an empty list `[]` and `null` as "no fields", and saves no fields as `[]`.
- With no fields, the page explains that any submission is accepted, but nothing is stored except metadata, because only validated fields are kept (_API Entries FR-1_).

**FR-6 Changing a live schema.** Renaming an input name, or removing a field, on a form that already has entries shows a warning: existing entries keep their old keys. Exports still include them as extra columns (_API Entries FR-8_), but the entries table may show them under "Other fields".

### Integrate tab

**FR-7 Endpoint.** Shows the submission URL `{apiPublicBase}/v1/forms/{id}/submissions` with a copy button. If the form is inactive, a banner says submissions will be rejected until it's turned on, with a button that turns it on.

**FR-8 HTML snippet.** Generates a copyable `<form method="post" action="…">` for the current schema:

- one input per field, named by its input name, labelled by its label;
- `type="email"` / `type="url"` / `type="number"` when the matching rule is set, and `required` when **Required** is set;
- a visually hidden honeypot input (`tabindex="-1"`, `autocomplete="off"`) when the honeypot is on, using the saved honeypot name;
- a note that the API returns JSON and never redirects (_API Entries FR-1a_), so a plain HTML post shows the JSON response. The JavaScript snippet is the recommended option.

**FR-9 JavaScript snippet.** Generates a copyable `fetch` example that:

- posts the form as JSON;
- shows `data.message`, or follows `data.redirect`, on 201;
- puts 422 `errors` on the matching inputs;
- handles 403 (inactive form or domain not allowed) and 429.

**FR-10 Test submit.**

- A form generated from the schema posts straight from the browser to the public endpoint, with no credentials, like a real site would.
- It shows the outcome:
  - 201 shows the success message and redirect;
  - 422 shows errors on the fields;
  - 403 shows the API's message;
  - 429 shows the rate-limit message.
- A note says the test creates a real entry, and links to the Entries tab.
- **Allowed domains:** if the form's allowed-domains list isn't empty and doesn't include the dashboard's host, the test will be rejected, because the API checks the `Referer` (_API Entries FR-1a_). The tab warns about this before submitting, and suggests temporarily adding the dashboard host or clearing the list.
- **Honeypot:** the honeypot input is shown in a "Simulate a bot" disclosure. Filling it in demonstrates that the response looks like success, but the entry is flagged as spam.
- **Spam classification:** test entries go through the same AI spam check as real ones (_API Entries FR-1a_). Throwaway content like "test test" may be flagged, which means it lands in Spam and no alert is sent. The success panel says so, and links to both Inbox and Spam. Placeholder values in the test form read as a plausible enquiry, to keep false positives down.

## 5. Non-functional requirements

- **NFR-1:** generated snippets escape labels and names for HTML and JavaScript, so a label like `"><script>` produces safe markup.
- **NFR-2:** the HTML snippet is accessible as generated: every input has a `<label for>`, and the honeypot is hidden from assistive technology.

## 6. Acceptance criteria

- **AC-1:** build a three-field schema with mixed rules, save, and reload. The order, labels, input names and rules are unchanged.
- **AC-2:** schema serialisation round-trips (unit test): IDs, array rules, string rules, unknown rules into the custom field, and `[]` read as empty. Fields are read sorted by `order` (not list position), and saved with `order` renumbered from 1.
- **AC-5:** every field ID the builder saves is a ULID, and fields saved out of order load sorted by `order` and save renumbered (checked end to end).
- **AC-3:** pasting the HTML snippet into a blank page and submitting creates an entry, once the dashboard origin is allowed.
- **AC-4:** a test submission missing a required field shows the 422 on that field. A valid one appears in the Entries tab.

## 7. API dependencies

- _API Forms_ §5 (schema format: a list of `{ id, order, label?, name?, rules? }`, `id` a unique ULID, `name` defaulting to the ID, returned sorted by `order`), §5a (honeypot, domains), FR-5 (schema → rules), FR-6 (inactive forms rejected). The shape is taken from the API's OpenAPI docs (`/docs/api.json`, `FormResource`, `FormStoreRequest`, `FormUpdateRequest`).
- _API Entries_ FR-1a (public submission, `Referer` domain check, honeypot behaviour, Jev spam classification, JSON-only responses, rate limits of 300/min per IP and 60/min per form per IP).

## 8. Gaps

- **Rule strings aren't validated when the form is saved.** An invalid rule name is accepted, and fails as a server error when someone submits (_API Forms, known issue_). The builder can't catch typos in custom rules.
- **No field types, placeholders or options in the schema.** The snippet infers input types from rules: `email`, `url` and `numeric` set the type, `max` over 255 makes a `<textarea>`, and an `in:` rule makes a `<select>` of its values. Checkboxes, radios and placeholders can't be expressed.

## 9. Open questions

1. Should the builder warn on custom rules that aren't in a known list of Laravel rules, given the API doesn't validate them?
2. Should the API's schema gain presentation fields (type, placeholder, options), so the snippet and test form can render selects and checkboxes?
