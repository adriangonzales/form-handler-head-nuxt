import { expect, type Page } from '@playwright/test'

export const credentials = {
  email: process.env.E2E_EMAIL ?? '',
  password: process.env.E2E_PASSWORD ?? '',
}

if (!credentials.email || !credentials.password) {
  throw new Error('Set E2E_EMAIL and E2E_PASSWORD (see .env.example) to run the E2E tests.')
}

export async function signIn(page: Page, path = '/forms') {
  await page.goto(path)
  await page.getByLabel('Email').fill(credentials.email)
  await page.getByLabel('Password').fill(credentials.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(path)
}
