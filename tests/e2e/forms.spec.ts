import { expect, test, type Page } from '@playwright/test'
import {
  apiPublicBase,
  createFormViaApi,
  deleteFormViaApi,
  schemaFields,
  signIn,
  uniqueName,
  goto,
  reload,
} from './support'

const created: string[] = []

async function track<T extends { id: string }>(form: Promise<T>) {
  const value = await form

  created.push(value.id)

  return value
}

test.afterEach(async ({ page }) => {
  for (const id of created.splice(0)) {
    await deleteFormViaApi(page, id)
  }
})

function formRow(page: Page, name: string) {
  return page.getByRole('row').filter({ has: page.getByRole('link', { name, exact: true }) })
}

test('create a form from a template, then turn it on', async ({ page }) => {
  await signIn(page)
  const name = uniqueName('Contact')

  await page.getByRole('link', { name: 'New form' }).first().click()
  await page.getByLabel('Name').fill(name)
  await page.getByText('Contact', { exact: true }).click()
  await page.getByRole('button', { name: 'Create form' }).click()

  await expect(page).toHaveURL(/\/forms\/[0-9A-Z]+\/integrate$/i)
  created.push(page.url().split('/').at(-2)!)
  await expect(page.getByText(`Created “${name}”`, { exact: true })).toBeVisible()

  const toggle = page.getByRole('switch')
  await expect(toggle).not.toBeChecked()
  await toggle.click()
  await expect(toggle).toBeChecked()
  await expect(page.getByText('Accepting submissions', { exact: true })).toBeVisible()

  await goto(page, '/forms')
  const firstRow = page.locator('tbody tr').first()
  await expect(firstRow.getByRole('link', { name, exact: true })).toBeVisible()
  await expect(firstRow.getByText('Active', { exact: true })).toBeVisible()
})

test('sort, filter and page size live in the URL', async ({ page }) => {
  await signIn(page)
  const inactive = await track(createFormViaApi(page, uniqueName('AAA Inactive')))

  await goto(page, '/forms')
  await page.getByRole('tab', { name: 'Inactive' }).click()
  await expect(page).toHaveURL(/active=false/)
  await page.getByRole('combobox', { name: 'Sort forms' }).click()
  await page.getByRole('option', { name: 'Name A–Z' }).click()
  await expect(page).toHaveURL(/sort=name/)
  await page.getByRole('combobox', { name: 'Rows per page' }).click()
  await page.getByRole('option', { name: '25' }).click()
  await expect(page).toHaveURL(/per_page=25/)

  await reload(page)
  await expect(page.getByRole('tab', { name: 'Inactive' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('combobox', { name: 'Sort forms' })).toContainText('Name A–Z')
  await expect(formRow(page, inactive.name)).toBeVisible()

  await page.goBack()
  await expect(page).not.toHaveURL(/per_page=25/)
  await expect(page).toHaveURL(/sort=name/)
})

test('the forms list shows entry, unread and spam counts', async ({ page, request }) => {
  await signIn(page)
  const form = await track(
    createFormViaApi(page, uniqueName('Counts'), {
      schema: schemaFields({ message: { label: 'Message', rules: ['required'] } }),
    }),
  )
  await page.request.put(`/api/v1/forms/${form.id}`, { data: { name: form.name, active: true } })

  for (const message of ['Hello, I would like a quote.', 'Can you call me back tomorrow?']) {
    const response = await request.post(`${apiPublicBase}/v1/forms/${form.id}/submissions`, {
      data: { message },
      headers: { Accept: 'application/json' },
    })

    expect(response.status()).toBe(201)
  }

  const entries = (await (await page.request.get(`/api/v1/forms/${form.id}/entries`)).json()).data
  // Wait out the background spam check, so it can't flip the entries while the test changes them.
  await page.request.patch(`/api/v1/entries/${entries[0].id}`, {
    data: { read_at: new Date().toISOString() },
  })

  await goto(page, '/forms')
  const row = formRow(page, form.name)
  await expect(row.getByRole('cell').nth(2)).toHaveText('2')
  await expect(row.getByText('1 unread')).toBeVisible()

  await page.request.patch(`/api/v1/entries/${entries[1].id}`, { data: { spam: true } })
  await reload(page)
  await expect(row.getByRole('cell').nth(2)).toHaveText('1')
  await expect(row.getByText(/unread/)).toHaveCount(0)
  await expect(row.getByRole('cell').nth(4)).toHaveText('1')
})

test('settings save, and a generated honeypot name is shown', async ({ page }) => {
  await signIn(page)
  const form = await track(createFormViaApi(page, uniqueName('Settings')))

  await goto(page, `/forms/${form.id}/settings`)
  await page.getByLabel('Success message').fill('Thanks, we will be in touch.')
  await page.getByLabel('Redirect URL').fill('https://example.com/thanks')
  await page.getByRole('textbox', { name: 'Allowed domains' }).fill('example.com')
  await page.getByRole('textbox', { name: 'Allowed domains' }).press('Enter')
  await page.getByRole('switch', { name: 'Honeypot field' }).click()
  await page.getByRole('button', { name: 'Save settings' }).click()

  await expect(page.getByText('Settings saved', { exact: true })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Honeypot input name' })).toHaveValue(
    /^[a-z]+_[a-z0-9]{6}$/,
  )

  await reload(page)
  await expect(page.getByLabel('Success message')).toHaveValue('Thanks, we will be in touch.')
  await expect(page.getByLabel('Redirect URL')).toHaveValue('https://example.com/thanks')
  await expect(page.getByText('example.com', { exact: true })).toBeVisible()
})

test('validation errors appear on the right field', async ({ page }) => {
  await signIn(page)
  const form = await track(
    createFormViaApi(page, uniqueName('Clash'), {
      schema: schemaFields({ email: { label: 'Email', rules: ['required', 'email'] } }),
    }),
  )

  await goto(page, `/forms/${form.id}/settings`)

  // Checked in the browser: not a bare hostname.
  await page.getByRole('textbox', { name: 'Allowed domains' }).fill('https://example.com/path')
  await page.getByRole('textbox', { name: 'Allowed domains' }).press('Enter')
  await page.getByRole('button', { name: 'Save settings' }).click()
  await expect(page.getByText(/Use bare hostnames such as example.com/)).toBeVisible()
  await page.getByRole('button', { name: 'Discard changes' }).click()

  // Checked by the API: the honeypot can't share a name with a field.
  await page.getByRole('switch', { name: 'Honeypot field' }).click()
  await page.getByRole('textbox', { name: 'Honeypot input name' }).fill('email')
  await page.getByRole('button', { name: 'Save settings' }).click()
  const honeypotField = page.locator('[data-slot="root"]', {
    has: page.getByRole('textbox', { name: 'Honeypot input name' }),
  })
  await expect(honeypotField.locator('[data-slot="error"]')).toBeVisible()
})

test('leaving with unsaved changes asks first', async ({ page }) => {
  await signIn(page)
  const form = await track(createFormViaApi(page, uniqueName('Unsaved')))

  await goto(page, `/forms/${form.id}/settings`)
  await page.getByLabel('Success message').fill('Not saved yet')

  page.once('dialog', (dialog) => dialog.dismiss())
  await page.getByRole('link', { name: 'Entries' }).click()
  await expect(page).toHaveURL(/\/settings$/)

  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('link', { name: 'Entries' }).click()
  await expect(page).toHaveURL(/\/entries$/)
})

test('delete a form, then undo', async ({ page }) => {
  await signIn(page)
  const form = await track(createFormViaApi(page, uniqueName('Delete me')))

  await goto(page, '/forms')
  await formRow(page, form.name)
    .getByRole('button', { name: `Actions for ${form.name}` })
    .click()
  await page.getByRole('menuitem', { name: 'Delete' }).click()

  await expect(page.getByText(`Deleted “${form.name}”`, { exact: true })).toBeVisible()
  await expect(formRow(page, form.name)).toHaveCount(0)

  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByText(`Restored “${form.name}”`, { exact: true })).toBeVisible()
  await expect(formRow(page, form.name)).toBeVisible()
})

test('duplicate a form', async ({ page }) => {
  await signIn(page)
  const form = await track(createFormViaApi(page, uniqueName('Original')))

  await goto(page, `/forms/${form.id}/settings`)
  await page.getByRole('button', { name: 'Form actions' }).click()
  await page.getByRole('menuitem', { name: 'Duplicate' }).click()

  await expect(page.getByLabel('Name')).toHaveValue(`${form.name} (copy)`)
  created.push(page.url().split('/').at(-2)!)
  expect(page.url()).not.toContain(form.id)
  await expect(page.getByRole('switch').first()).not.toBeChecked()
})

test('an unknown form shows the not-found page', async ({ page }) => {
  await signIn(page)
  await goto(page, '/forms/01JZZZZZZZZZZZZZZZZZZZZZZZ/settings')

  await expect(page.getByText('Not found', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Back to forms' })).toBeVisible()
})
