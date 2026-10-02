import { expect, test, type Page } from '@playwright/test'
import { createFormViaApi, deleteFormViaApi, goto, reload, signIn, uniqueName } from './support'

const created: string[] = []

test.afterEach(async ({ page }) => {
  for (const id of created.splice(0)) {
    await deleteFormViaApi(page, id)
  }
})

async function createForm(page: Page, prefix: string) {
  const form = await createFormViaApi(page, uniqueName(prefix))

  created.push(form.id)

  return form
}

async function addRecipient(page: Page, formId: string, data: Record<string, unknown>) {
  const response = await page.request.post(`/api/v1/forms/${formId}/notifications`, { data })

  expect(response.status(), await response.text()).toBe(201)

  return (await response.json()).data as { id: string; value: string }
}

function row(page: Page, value: string) {
  return page.locator('tbody tr').filter({ hasText: value })
}

const dialog = (page: Page) => page.getByRole('dialog')

test('add an email recipient, then edit it', async ({ page }) => {
  await signIn(page)
  const form = await createForm(page, 'Alerts')

  await goto(page, `/forms/${form.id}/notifications`)
  await expect(page.getByText('Nobody is alerted yet')).toBeVisible()
  await page.getByRole('button', { name: 'Add recipient' }).first().click()

  await dialog(page).getByLabel('Email address').fill('not-an-email')
  await dialog(page).getByRole('button', { name: 'Add recipient' }).click()
  await expect(dialog(page).getByText('Enter a valid email address.')).toBeVisible()

  await dialog(page).getByLabel('Email address').fill('alerts@example.com')
  await dialog(page).getByRole('button', { name: 'Add recipient' }).click()
  await expect(page.getByText('Added alerts@example.com', { exact: true })).toBeVisible()
  await expect(row(page, 'alerts@example.com').getByRole('switch')).toBeChecked()

  await reload(page)
  await row(page, 'alerts@example.com')
    .getByRole('button', { name: 'Actions for alerts@example.com' })
    .click()
  await page.getByRole('menuitem', { name: 'Edit' }).click()
  await expect(dialog(page).getByLabel('Email address')).toHaveValue('alerts@example.com')
  await dialog(page).getByLabel('Email address').fill('team@example.com')
  await dialog(page).getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Recipient saved', { exact: true })).toBeVisible()
  await expect(row(page, 'team@example.com')).toBeVisible()
  await expect(row(page, 'alerts@example.com')).toHaveCount(0)
})

test('SMS numbers must be in E.164 format, and SMS is marked as not delivered', async ({
  page,
}) => {
  await signIn(page)
  const form = await createForm(page, 'SMS')

  await goto(page, `/forms/${form.id}/notifications`)
  await page.getByRole('button', { name: 'Add recipient' }).first().click()
  await dialog(page).getByRole('tab', { name: 'SMS' }).click()
  await expect(dialog(page).getByText("SMS alerts aren't sent yet")).toBeVisible()

  const phone = dialog(page).getByLabel('Phone number')
  await phone.fill('415-555-2671')
  await dialog(page).getByRole('button', { name: 'Add recipient' }).click()
  await expect(dialog(page).getByText(/Start with \+ and the country code/)).toBeVisible()

  await phone.fill('+1 (415) 555-2671')
  await phone.blur()
  await expect(phone).toHaveValue('+14155552671')
  await dialog(page).getByRole('button', { name: 'Add recipient' }).click()

  await expect(row(page, '+14155552671').getByText('Not delivered yet')).toBeVisible()
})

test('the API rejects an invalid SMS number on the value field', async ({ page }) => {
  await signIn(page)
  const form = await createForm(page, 'SMS API')
  const response = await page.request.post(`/api/v1/forms/${form.id}/notifications`, {
    data: { type: 'sms', value: '415-555-2671' },
  })

  expect(response.status()).toBe(422)
  expect(Object.keys((await response.json()).errors)).toEqual(['value'])
})

test('turning a recipient off persists, and Remove can be undone', async ({ page }) => {
  await signIn(page)
  const form = await createForm(page, 'Toggle')
  await addRecipient(page, form.id, { type: 'email', value: 'toggle@example.com' })

  await goto(page, `/forms/${form.id}/notifications`)
  const toggle = row(page, 'toggle@example.com').getByRole('switch')
  await toggle.click()
  await expect(toggle).not.toBeChecked()

  await reload(page)
  await expect(row(page, 'toggle@example.com').getByRole('switch')).not.toBeChecked()
  await row(page, 'toggle@example.com').getByRole('switch').click()
  await reload(page)
  await expect(row(page, 'toggle@example.com').getByRole('switch')).toBeChecked()

  await row(page, 'toggle@example.com')
    .getByRole('button', { name: 'Actions for toggle@example.com' })
    .click()
  await page.getByRole('menuitem', { name: 'Remove' }).click()
  await expect(page.getByText('Removed toggle@example.com', { exact: true })).toBeVisible()
  await expect(row(page, 'toggle@example.com')).toHaveCount(0)

  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByText('Restored toggle@example.com', { exact: true })).toBeVisible()
  await expect(row(page, 'toggle@example.com').getByRole('switch')).toBeChecked()
})

test('a recipient with a delivery problem shows the error', async ({ page }) => {
  await signIn(page)
  const form = await createForm(page, 'Bounce')
  const recipient = await addRecipient(page, form.id, { type: 'email', value: 'gone@example.com' })
  const message = 'Bounced (HardBounce): The server was unable to deliver your message.'

  // Errors come from Postmark's webhook, which needs its secret, so fake the stored error.
  await page.route(`**/api/v1/forms/${form.id}/notifications*`, async (route) => {
    const response = await route.fetch()
    const body = await response.json()

    for (const item of body.data) {
      if (item.id === recipient.id) item.error = message
    }

    await route.fulfill({ response, json: body })
  })

  // The first load renders on the server, out of the route's reach, so arrive by client navigation.
  await goto(page, `/forms/${form.id}/settings`)
  await page.getByRole('link', { name: 'Notifications' }).click()
  const recipientRow = row(page, 'gone@example.com')
  await expect(recipientRow.getByText('Delivery problem')).toBeVisible()
  await expect(recipientRow).toContainText(message)
  await expect(recipientRow).toContainText('Clears after the next successful delivery.')
})
