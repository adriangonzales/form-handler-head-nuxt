import { expect, test } from '@playwright/test'
import { credentials, signIn } from './support'

test('guests are sent to the login page with a way back', async ({ page }) => {
  await page.goto('/forms')

  await expect(page).toHaveURL(/\/login\?redirect=\/forms$/)
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
})

test('wrong credentials show the API message on the email field', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill(credentials.email)
  await page.getByLabel('Password').fill('not-the-password')
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(page.getByText('These credentials do not match our records.')).toBeVisible()
  await expect(page).toHaveURL(/\/login/)
})

test('signing in returns to the requested page and survives a reload', async ({ page }) => {
  await signIn(page, '/account')

  await expect(page.getByLabel('Email', { exact: true })).toHaveValue(credentials.email)

  await page.reload()
  await expect(page).toHaveURL('/account')
  await page.goto('/forms')
  await expect(page.getByRole('link', { name: 'New form' }).first()).toBeVisible()
})

test('the API token never reaches the browser', async ({ page }) => {
  await signIn(page)

  const session = await (await page.request.get('/api/_auth/session')).json()
  const html = await (await page.request.get('/forms')).text()
  const documentCookie = await page.evaluate(() => document.cookie)

  expect(session.user.email).toBe(credentials.email)
  expect(session).not.toHaveProperty('secure')
  // JWTs start with a base64url-encoded `{"` header.
  expect(JSON.stringify(session)).not.toContain('eyJ')
  expect(html).not.toContain('eyJ')
  expect(documentCookie).not.toContain('nuxt-session')
})

test('parallel requests share one token refresh', async ({ page }) => {
  await signIn(page)

  // Every request refreshes in this suite, and each refresh deny-lists the previous token, so
  // concurrent requests with the same cookie only succeed if they share a refresh.
  const responses = await Promise.all(
    Array.from({ length: 10 }, () => page.request.get('/api/v1/forms?per_page=1')),
  )

  expect(responses.map((response) => response.status())).toEqual(Array(10).fill(200))

  await page.reload()
  await expect(page.getByRole('link', { name: 'New form' }).first()).toBeVisible()
})

test('a server-rendered page passes a refreshed session cookie to the browser', async ({
  page,
}) => {
  await signIn(page)

  // The page's data is loaded through the proxy during SSR, which refreshes the token here. The
  // new session cookie must reach the browser, or it would keep a deny-listed token.
  const response = await page.request.get('/forms')
  const setCookies = response
    .headersArray()
    .filter(({ name }) => name.toLowerCase() === 'set-cookie')

  expect(setCookies.some(({ value }) => value.startsWith('nuxt-session='))).toBe(true)
})

test('the proxy refuses auth, webhook and traversal paths', async ({ page }) => {
  await signIn(page)

  for (const path of [
    '/api/v1/auth/me',
    '/api/v1/webhooks/postmark/bounces',
    '/api/v1/forms/..%2fauth/me',
    '/api/v1/forms/%2e%2e/auth/me',
  ]) {
    expect((await page.request.get(path)).status(), path).toBe(404)
  }
})

test('logging out ends the session everywhere it is used', async ({ page }) => {
  await signIn(page)

  await page.getByRole('button', { name: 'E2E Test User' }).click()
  await page.getByRole('menuitem', { name: 'Log out' }).click()

  await expect(page).toHaveURL(/\/login\?reason=signed-out/)
  await expect(page.getByText("You've been signed out.")).toBeVisible()
  expect((await page.request.get('/api/v1/forms')).status()).toBe(401)

  await page.goto('/forms')
  await expect(page).toHaveURL(/\/login/)
})

test('logging out from a copy of the session ends it, even after the browser refreshed', async ({
  page,
  context,
}) => {
  await signIn(page)
  const cookies = await context.cookies()

  // Every request refreshes the token in this suite, so this moves the browser past the copy's
  // token, which the page's own requests could also do at any moment.
  expect((await page.request.get('/api/v1/forms')).status()).toBe(200)

  const other = await context.browser()!.newContext()

  await other.addCookies(cookies)
  await other.request.post(`${test.info().project.use.baseURL}/api/auth/logout`)
  await other.close()

  // The browser's newer token was revoked too.
  expect((await page.request.get('/api/v1/forms')).status()).toBe(401)
})

test('forgot password gives the same answer for unknown emails', async ({ page }) => {
  await page.goto('/forgot-password')
  await page.getByLabel('Email').fill('nobody@example.test')
  await page.getByRole('button', { name: 'Send reset link' }).click()

  await expect(page.getByText(/If an account exists for that email/)).toBeVisible()
})

test('an invalid reset link explains itself and offers a new one', async ({ page }) => {
  await page.goto(`/reset-password?token=invalid&email=${encodeURIComponent(credentials.email)}`)
  await page.getByLabel('New password', { exact: true }).fill('Another-Pass-123!')
  await page.getByLabel('Confirm new password').fill('Another-Pass-123!')
  await page.getByRole('button', { name: 'Reset password' }).click()

  await expect(page.getByText('This password reset token is invalid.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Request a new link' })).toBeVisible()
})

test('a reset link without its token is reported as incomplete', async ({ page }) => {
  await page.goto('/reset-password')

  await expect(page.getByText('This reset link is incomplete.')).toBeVisible()
})
