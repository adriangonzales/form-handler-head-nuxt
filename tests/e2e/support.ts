import { readFileSync } from 'node:fs'
import { expect, type Page } from '@playwright/test'
import { ulid } from '../../app/utils/ulid'
import '../support/env'
import { type Account, createThrowawayUser } from '../support/throwaway-user'

export { type Account, createThrowawayUser }

export const e2eUserFile = new URL('../../playwright/.auth/e2e-user.json', import.meta.url).pathname

/** The throwaway user global-setup.ts created for this run, which the suite signs in as. */
export const credentials: Account = {
  get name() {
    return e2eUser().name
  },
  get email() {
    return e2eUser().email
  },
  get password() {
    return e2eUser().password
  },
}

let cached: Account | undefined

function e2eUser(): Account {
  return (cached ??= JSON.parse(readFileSync(e2eUserFile, 'utf8')))
}

export async function signIn(page: Page, path = '/forms') {
  await page.goto(path)
  await page.getByLabel('Email').fill(credentials.email)
  await page.getByLabel('Password').fill(credentials.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(path)
}

/** The Backend's public API base, which browsers post submissions to. */
export const apiPublicBase = (
  process.env.NUXT_PUBLIC_API_PUBLIC_BASE ??
  process.env.NUXT_API_BASE ??
  'http://localhost:8001/api'
).replace(/\/+$/, '')

export interface CreatedForm {
  id: string
  name: string
  active: boolean
}

/** Creates a form through the dashboard's proxy (the page must be signed in). */
export async function createFormViaApi(
  page: Page,
  name: string,
  body: Record<string, unknown> = {},
): Promise<CreatedForm> {
  const response = await page.request.post('/api/v1/forms', { data: { name, ...body } })

  expect(response.status(), await response.text()).toBe(201)

  return (await response.json()).data
}

/** A list-shaped schema from input names: each field gets a fresh ULID `id` and the next `order`. */
export function schemaFields(fields: Record<string, { label?: string; rules?: string[] }>) {
  return Object.entries(fields).map(([name, field], index) => ({
    id: ulid(),
    order: index + 1,
    name,
    ...field,
  }))
}

export async function deleteFormViaApi(page: Page, id: string) {
  await page.request.delete(`/api/v1/forms/${id}`)
}

export function uniqueName(prefix: string) {
  return `${prefix} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

declare global {
  interface Window {
    useNuxtApp?: () => { isHydrating?: boolean }
  }
}

async function hydrated(page: Page) {
  await page.waitForFunction(() => window.useNuxtApp?.().isHydrating === false)
}

/** Navigates and waits for hydration, so the next click reaches Vue rather than static HTML. */
export async function goto(page: Page, url: string) {
  await page.goto(url)
  await hydrated(page)
}

export async function reload(page: Page) {
  await page.reload()
  await hydrated(page)
}

export async function signInAs(
  page: Page,
  account: Pick<Account, 'email' | 'password'>,
  path = '/forms',
) {
  await page.goto(path)
  await page.getByLabel('Email').fill(account.email)
  await page.getByLabel('Password').fill(account.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(path)
}

/** Deletes the signed-in account through the dashboard's server route, ignoring failures. */
export async function deleteAccountViaApi(page: Page, password: string) {
  await page.request.delete('/api/auth/me', { data: { password } }).catch(() => undefined)
}
