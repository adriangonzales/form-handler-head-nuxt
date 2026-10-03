import { expect, test, type Page } from '@playwright/test'
import {
  credentials,
  createThrowawayUser,
  deleteAccountViaApi,
  goto,
  reload,
  signInAs,
  type Account,
} from './support'

// Each test signs in as its own throwaway user, so changing or deleting the account can't affect
// the suite's E2E user. Users still left at the end are deleted.
const leftovers: { page: Page; account: Account }[] = []

test.afterEach(async () => {
  for (const { page, account } of leftovers.splice(0)) {
    await deleteAccountViaApi(page, account.password)
  }
})

test('changing the name updates the header without a reload', async ({ page }) => {
  const account = createThrowawayUser()
  leftovers.push({ page, account })
  await signInAs(page, account, '/account')

  const footer = page.locator('[data-slot="footer"]')
  await expect(footer).toContainText(account.name)

  await page.getByLabel('Name').fill('Renamed Person')
  await page.getByRole('button', { name: 'Save profile' }).click()
  await expect(page.getByText('Profile saved', { exact: true })).toBeVisible()
  await expect(footer).toContainText('Renamed Person')

  await reload(page)
  await expect(page.getByLabel('Name')).toHaveValue('Renamed Person')
})

test('an email that is already taken shows on the email field', async ({ page }) => {
  const account = createThrowawayUser()
  leftovers.push({ page, account })
  await signInAs(page, account, '/account')

  await page.getByLabel('Email', { exact: true }).fill(credentials.email)
  await expect(page.getByText('Changing your email clears its verified status')).toBeVisible()
  await page.getByRole('button', { name: 'Save profile' }).click()

  const emailField = page.locator('[data-slot="root"]', {
    has: page.getByLabel('Email', { exact: true }),
  })
  await expect(emailField.locator('[data-slot="error"]')).toContainText(/taken/i)
})

test('changing the password keeps this session and signs out other browsers', async ({
  page,
  browser,
}) => {
  const account = createThrowawayUser()
  const newPassword = `${account.password}-new`
  const other = await browser.newPage()

  await signInAs(other, account, '/forms')
  await signInAs(page, account, '/account')

  await page.getByLabel('Current password').fill('not-my-password')
  await page.getByLabel('New password', { exact: true }).fill(newPassword)
  await page.getByLabel('Confirm new password').fill(newPassword)
  await page.getByRole('button', { name: 'Change password' }).click()
  const currentField = page.locator('[data-slot="root"]', {
    has: page.getByLabel('Current password'),
  })
  await expect(currentField.locator('[data-slot="error"]')).toBeVisible()

  await page.getByLabel('Current password').fill(account.password)
  // Typing clears the API's error once the form re-validates; wait for that, as a person would,
  // so the button doesn't move up under the click.
  await expect(currentField.locator('[data-slot="error"]')).toHaveCount(0)
  await page.getByRole('button', { name: 'Change password' }).click()
  await expect(page.getByText('Password changed', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Current password')).toHaveValue('')
  leftovers.push({ page, account: { ...account, password: newPassword } })

  // This browser carries on.
  await goto(page, '/forms')
  await expect(page).toHaveURL('/forms')
  await expect(page.getByRole('link', { name: 'New form' }).first()).toBeVisible()

  // The other one is signed out on its next request.
  await other.reload()
  await expect(other).toHaveURL(/\/login/)
  await other.close()
})

test('deleting the account needs the right password, then signs out for good', async ({ page }) => {
  const account = createThrowawayUser()
  leftovers.push({ page, account })
  await signInAs(page, account, '/account')

  await page.getByRole('button', { name: 'Delete account…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Delete your account?' })
  const confirm = dialog.getByRole('button', { name: 'Delete account' })

  await dialog.getByLabel('Password').fill('wrong-password')
  await expect(confirm).toBeDisabled()
  await dialog.getByLabel(`Type ${account.email} to confirm`).fill(account.email)
  await expect(confirm).toBeEnabled()
  await confirm.click()
  await expect(dialog.getByText(/password is incorrect/i)).toBeVisible()

  await dialog.getByLabel('Password').fill(account.password)
  await confirm.click()
  await expect(page).toHaveURL(/\/login\?reason=account-deleted/)
  await expect(page.getByText('Your account has been deleted.')).toBeVisible()
  leftovers.pop()
  // The modal's password input stays in the DOM until its closing transition ends.
  await expect(dialog).toBeHidden()

  await page.getByLabel('Email').fill(account.email)
  await page.getByLabel('Password').fill(account.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText(/credentials/i)).toBeVisible()
  await expect(page).toHaveURL(/\/login/)
})
