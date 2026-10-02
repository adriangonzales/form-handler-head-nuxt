import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { createFormViaApi, deleteFormViaApi, goto, signIn, uniqueName } from './support'

// These tests need the API's queue worker running (`php artisan queue:work`): exports are built in
// the background.

const created: string[] = []

test.afterEach(async ({ page }) => {
  for (const id of created.splice(0)) {
    await deleteFormViaApi(page, id)
  }
})

const schema = {
  '01K6E2E0000000000000000001': { label: 'Full name', name: 'name' },
  '01K6E2E0000000000000000002': { label: 'Your message', name: 'message' },
}

async function createForm(page: Page, prefix: string) {
  const form = await createFormViaApi(page, uniqueName(prefix), { schema })

  created.push(form.id)
  // Entries can only be added to an active form.
  await page.request.put(`/api/v1/forms/${form.id}`, { data: { name: form.name, active: true } })

  return form
}

async function addEntry(page: Page, formId: string, input: Record<string, string>) {
  const response = await page.request.post(`/api/v1/forms/${formId}/entries`, { data: input })

  expect(response.status(), await response.text()).toBe(201)

  return (await response.json()).data as { id: string }
}

async function startExport(page: Page, formId: string, body: Record<string, unknown> = {}) {
  const response = await page.request.post(`/api/v1/forms/${formId}/entries/exports`, {
    data: body,
  })

  expect(response.status(), await response.text()).toBe(202)

  return (await response.json()).data as { id: string; form_id: string }
}

const exportsPopover = (page: Page) =>
  page.getByRole('dialog').filter({ has: page.getByText('Recent exports') })

/** Splits a CSV line, enough for the simple values these tests write. */
function cells(line: string) {
  return line.split(',').map((cell) => cell.replace(/^"|"$/g, ''))
}

test('export the Starred tab, then download a CSV with the schema columns', async ({ page }) => {
  await signIn(page)
  const form = await createForm(page, 'Export')

  for (const message of ['First', 'Second', 'Third']) {
    const entry = await addEntry(page, form.id, { name: 'Ana', message })

    if (message !== 'Second') {
      await page.request.patch(`/api/v1/entries/${entry.id}`, { data: { starred: true } })
    }
  }

  await goto(page, `/forms/${form.id}/entries?status=starred`)
  await expect(page.locator('tbody tr')).toHaveCount(2)
  await page.getByRole('button', { name: 'Export CSV' }).click()

  const popover = exportsPopover(page)
  await expect(popover).toBeVisible()
  await expect(popover.getByText('Starred · newest first')).toBeVisible()
  await expect(popover.getByText('2 entries')).toBeVisible({ timeout: 20_000 })

  const downloading = page.waitForEvent('download')
  await popover.getByRole('button', { name: /^Download / }).click()
  const download = await downloading

  expect(download.suggestedFilename()).toMatch(/-entries-\d{4}-\d{2}-\d{2}\.csv$/)
  const lines = (await readFile((await download.path())!, 'utf8')).trim().split(/\r?\n/)
  const header = cells(lines[0]!.replace(/^\uFEFF/, ''))

  expect(header.slice(0, 4)).toEqual(['id', 'created_at', 'Full name', 'Your message'])
  expect(header).toContain('spam_checked_at')
  expect(lines).toHaveLength(3)
  // Newest first, as in the table.
  expect(cells(lines[1]!)[3]).toBe('Third')
  expect(cells(lines[2]!)[3]).toBe('First')
})

test('Download fetches the export again for a fresh link', async ({ page }) => {
  await signIn(page)
  const form = await createForm(page, 'Fresh link')
  await addEntry(page, form.id, { name: 'Bo', message: 'Hi' })
  const entryExport = await startExport(page, form.id, { sort: '-created_at' })

  await goto(page, `/forms/${form.id}/entries`)
  await page.getByRole('button', { name: /^Exports/ }).click()
  const popover = exportsPopover(page)
  await expect(popover.getByText('1 entry')).toBeVisible({ timeout: 20_000 })

  const refetch = page.waitForRequest(
    (request) =>
      request.method() === 'GET' &&
      request.url().endsWith(`/api/v1/entry-exports/${entryExport.id}`),
  )
  const downloading = page.waitForEvent('download')
  await popover.getByRole('button', { name: /^Download / }).click()
  await refetch
  await downloading
})

test('a failed export shows its error, and Try again starts one with the same filters', async ({
  page,
}) => {
  await signIn(page)
  const form = await createForm(page, 'Failed')
  const entryExport = await startExport(page, form.id, {
    filter: { spam: 'true' },
    sort: 'created_at',
  })

  // The API only fails an export when its form is deleted, and then hides it, so fake the failure.
  await page.route('**/api/v1/entry-exports?*', async (route) => {
    const response = await route.fetch()
    const body = await response.json()

    for (const row of body.data) {
      if (row.id === entryExport.id) {
        Object.assign(row, { status: 'failed', error: 'The disk was full.', download_url: null })
      }
    }

    await route.fulfill({ response, json: body })
  })

  await goto(page, `/forms/${form.id}/entries`)
  await page.getByRole('button', { name: /^Exports/ }).click()
  const popover = exportsPopover(page)
  await expect(popover.getByText('The disk was full.')).toBeVisible()

  const retried = page.waitForRequest(
    (request) =>
      request.method() === 'POST' && request.url().endsWith(`/forms/${form.id}/entries/exports`),
  )
  await popover.getByRole('button', { name: 'Try again' }).click()
  expect((await retried).postDataJSON()).toEqual({ filter: { spam: 'true' }, sort: 'created_at' })
  await expect(popover.getByText('Spam · oldest first')).toHaveCount(2)
})

test('an expired export is removed when downloaded', async ({ page }) => {
  await signIn(page)
  const form = await createForm(page, 'Expired')
  const entryExport = await startExport(page, form.id)

  await goto(page, `/forms/${form.id}/entries`)
  await page.getByRole('button', { name: /^Exports/ }).click()
  const popover = exportsPopover(page)
  await expect(popover.getByText('0 entries')).toBeVisible({ timeout: 20_000 })

  await page.route(`**/api/v1/entry-exports/${entryExport.id}`, (route) =>
    route.fulfill({ status: 404, json: { message: 'Not found.' } }),
  )
  await popover.getByRole('button', { name: /^Download / }).click()
  await expect(page.getByText('This export has expired', { exact: true })).toBeVisible()
  await expect(popover.getByText('0 entries')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Export again' })).toBeVisible()
})

test('the Exports page lists exports across forms, without those of deleted forms', async ({
  page,
}) => {
  await signIn(page)
  const first = await createForm(page, 'Exports A')
  const second = await createForm(page, 'Exports B')
  const deleted = await createFormViaApi(page, uniqueName('Exports gone'), { schema })

  await startExport(page, first.id, { filter: { read: 'false', spam: 'false' } })
  await startExport(page, second.id, { filter: { trashed: 'only' }, sort: '-created_at' })
  await startExport(page, deleted.id)
  await deleteFormViaApi(page, deleted.id)

  await goto(page, '/exports')
  const firstRow = page.locator('tbody tr').filter({ hasText: first.name })
  const secondRow = page.locator('tbody tr').filter({ hasText: second.name })

  await expect(firstRow).toContainText('Unread · oldest first')
  await expect(secondRow).toContainText('Trash · newest first')
  await expect(firstRow.getByRole('link', { name: first.name })).toHaveAttribute(
    'href',
    `/forms/${first.id}/entries`,
  )
  // Unknown forms fall back to the filename, which starts with the form's slug.
  const deletedSlug = deleted.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  await expect(page.locator('tbody tr').filter({ hasText: deletedSlug })).toHaveCount(0)
  await expect(page.locator('tbody tr').filter({ hasText: deleted.name })).toHaveCount(0)
  await expect(firstRow.getByRole('button', { name: /^Download / })).toBeVisible({
    timeout: 20_000,
  })
})
