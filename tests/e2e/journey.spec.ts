import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { credentials, deleteFormViaApi, goto, uniqueName } from './support'

/**
 * The happy path through every milestone, in the UI only: sign in, create a form from a template,
 * turn it on, send a test submission, find it in the Inbox and on the forms list, star it, export
 * the Starred tab, add a recipient, and sign out. Needs the API's queue worker.
 */

let formId: string | undefined

test.afterEach(async ({ page }) => {
  if (formId) {
    await page.request.delete(`/api/v1/forms/${formId}`).catch(() => undefined)
    formId = undefined
  }
})

test('from sign-in to export and sign-out', async ({ page }) => {
  test.slow()
  const name = uniqueName('Journey')
  const message = `Hello from the journey test ${Date.now()}`

  await test.step('sign in', async () => {
    await goto(page, '/')
    await expect(page).toHaveURL(/\/login/)
    await page.getByLabel('Email').fill(credentials.email)
    await page.getByLabel('Password').fill(credentials.password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL('/forms')
  })

  await test.step('create a form from the Contact template and turn it on', async () => {
    await page.getByRole('link', { name: 'New form' }).first().click()
    await page.getByLabel('Name').fill(name)
    await page.getByText('Contact', { exact: true }).click()
    await page.getByRole('button', { name: 'Create form' }).click()

    await expect(page).toHaveURL(/\/forms\/[0-9a-z]+\/integrate$/i)
    formId = page.url().split('/').at(-2)

    await page.getByRole('button', { name: 'Turn on' }).click()
    await expect(page.getByText('This form is inactive', { exact: true })).toHaveCount(0)
  })

  await test.step('send a test submission', async () => {
    await page.getByRole('textbox', { name: 'Name' }).fill('Ada Lovelace')
    await page.getByRole('textbox', { name: 'Email' }).fill('ada@example.com')
    await page.getByRole('textbox', { name: 'Message' }).fill(message)
    await page.getByRole('button', { name: 'Send test submission' }).click()
    await expect(page.getByText('Submission accepted')).toBeVisible()
  })

  await test.step('the forms list counts it as unread', async () => {
    await page.getByRole('link', { name: 'Forms' }).first().click()
    const row = page.getByRole('row').filter({ has: page.getByRole('link', { name, exact: true }) })

    await expect(row.getByText('1 unread')).toBeVisible()
    await row.getByRole('link', { name, exact: true }).click()
  })

  await test.step('it is in the Inbox, and starring it moves it to Starred', async () => {
    await expect(page).toHaveURL(/\/entries$/)
    const entry = page.locator('tbody tr').filter({ hasText: message })

    await expect(entry).toBeVisible()
    await entry.getByRole('checkbox').check()
    await page
      .getByRole('toolbar', { name: 'Bulk actions' })
      .getByRole('button', { name: 'Star', exact: true })
      .click()
    await expect(page.getByText('1 entry starred', { exact: true })).toBeVisible()

    await page.getByRole('tab', { name: /^Starred/ }).click()
    await expect(page).toHaveURL(/status=starred/)
    await expect(page.locator('tbody tr').filter({ hasText: message })).toBeVisible()
  })

  await test.step('export the Starred tab and download the CSV', async () => {
    await page.getByRole('button', { name: 'Export CSV' }).click()
    const popover = page.getByRole('dialog').filter({ has: page.getByText('Recent exports') })

    await expect(popover.getByText('1 entry')).toBeVisible({ timeout: 20_000 })

    const downloading = page.waitForEvent('download')
    await popover.getByRole('button', { name: /^Download / }).click()
    const csv = await readFile((await (await downloading).path())!, 'utf8')

    expect(csv).toContain(message)
    await page.keyboard.press('Escape')
  })

  await test.step('add an email recipient', async () => {
    await page.getByRole('link', { name: 'Notifications' }).click()
    await page.getByRole('button', { name: 'Add recipient' }).first().click()
    await page.getByRole('dialog').getByLabel('Email address').fill('alerts@example.com')
    await page.getByRole('dialog').getByRole('button', { name: 'Add recipient' }).click()
    await expect(page.locator('tbody').getByText('alerts@example.com')).toBeVisible()
  })

  await test.step('sign out', async () => {
    await page.getByRole('button', { name: 'E2E Test User' }).click()
    await page.getByRole('menuitem', { name: 'Log out' }).click()
    await expect(page).toHaveURL(/\/login\?reason=signed-out/)
  })

  // The session is gone, so clean up with a fresh sign-in.
  if (formId) {
    const id = formId

    formId = undefined
    await goto(page, '/login')
    await page.getByLabel('Email').fill(credentials.email)
    await page.getByLabel('Password').fill(credentials.password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL('/forms')
    await deleteFormViaApi(page, id)
  }
})
