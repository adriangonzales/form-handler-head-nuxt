# PRD: Form Fields & Integration

**Status:** Planned (milestone 4) · **Owner area:** `app/pages/forms/[id]/fields.vue`, `app/pages/forms/[id]/integrate.vue`, `app/components/forms/SchemaBuilder.vue`, `app/components/forms/SchemaFieldRow.vue`, `app/components/forms/EmbedSnippet.vue`, `app/components/forms/TestSubmit.vue`

## 1. Summary

A form's fields are defined in its `schema`: an object keyed by field ID, where each field has an optional label, an input name and Laravel validation rules. The API validates submissions against it.

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

- **Field ID:** the schema key. Required, unique within the form, letters, digits, `_` and `-`. New fields get a slug from the label (`Email address` → `email_address`).
- **Label:** optional. Shown in entries and alert emails, falling back to the ID.
- **Input name:** optional, with the field ID as the placeholder because it's the default (_API Forms §5_). This is the `name` the site's input must use.
- **Rules:** see FR-2.

**FR-2 Rules editor.**

- Toggles and inputs for common rules: **Required**, **Email**, **Numeric**, **URL**, **Max length / value** (`max:N`), **Min** (`min:N`), and **One of** (`in:a,b,c`, entered as tags).
- A **custom rules** text field for any other Laravel rule.
- Rules are always saved as an array, e.g. `["required", "email", "max:255"]`. Either an array or a comma-separated string is accepted when reading.
- Rules the presets don't recognise go into the custom field, unchanged.

**FR-3 Edit, add, remove and reorder.** Fields can be added, removed, and reordered by drag and drop, or with move-up/move-down buttons for keyboard users. The order on screen is the order of the keys in the saved `schema` object.

**FR-4 Save.**

- **Save** sends `PUT /v1/forms/{id}` with the current `name`, `active` and the serialised `schema`.
- A 422 on `schema` (for example a field's input name clashing with the honeypot name) shows above the list.
- The page warns before the user leaves with unsaved changes.

**FR-5 Empty schema.**

- The API returns an empty schema as `[]` rather than `{}` (_API Forms §5_). The builder treats `[]` and `null` as "no fields".
- With no fields, the page explains that any submission is accepted, but nothing is stored except metadata, because only validated fields are kept (_API Entries FR-1_).

**FR-6 Changing a live schema.** Renaming a field ID or input name, or removing a field, on a form that already has entries shows a warning: existing entries keep their old keys. Exports still include them as extra columns (_API Entries FR-8_), but the entries table may show them under "Other fields".

### Integrate tab

**FR-7 Endpoint.** Shows the submission URL `{apiPublicBase}/v1/forms/{id}/submissions` with a copy button. If the form is inactive, a banner says submissions will be rejected until it's turned on, with a button that turns it on.

**FR-8 HTML snippet.** Generates a copyable `<form method="post" action="…">` for the current schema:

- one input per field, named by its input name (or field ID), labelled by its label;
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
- **AC-2:** schema serialisation round-trips (unit test): array rules, string rules, unknown rules into the custom field, `name` left out when it equals the ID, and `[]` read as empty.
- **AC-3:** pasting the HTML snippet into a blank page and submitting creates an entry, once the dashboard origin is allowed.
- **AC-4:** a test submission missing a required field shows the 422 on that field. A valid one appears in the Entries tab.

## 7. API dependencies

- _API Forms_ §5 (schema format, `name` defaults to the ID, empty schema returned as `[]`), §5a (honeypot, domains), FR-5 (schema → rules), FR-6 (inactive forms rejected).
- _API Entries_ FR-1a (public submission, `Referer` domain check, honeypot behaviour, Jev spam classification, JSON-only responses, rate limits of 300/min per IP and 60/min per form per IP).

## 8. Gaps

- **Rule strings aren't validated when the form is saved.** An invalid rule name is accepted, and fails as a server error when someone submits (_API Forms, known issue_). The builder can't catch typos in custom rules.
- **No field types, placeholders or options in the schema.** The snippet infers input types from rules. `in:` rules become a text input, not a `<select>`, because the schema has nowhere to store the presentation.

## 9. Open questions

1. Should the builder warn on custom rules that aren't in a known list of Laravel rules, given the API doesn't validate them?
2. Should the API's schema gain presentation fields (type, placeholder, options), so the snippet and test form can render selects and checkboxes?
