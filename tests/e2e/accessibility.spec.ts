import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator, type Page } from '@playwright/test'
import {
  createFormViaApi,
  deleteFormViaApi,
  goto,
  schemaFields,
  signIn,
  uniqueName,
} from './support'

/**
 * Scans every screen with axe (WCAG 2.1 A/AA rules) in light and dark mode. Each test signs in once
 * and visits its screens in turn, so a failure names the screen and the rule.
 */

const created: string[] = []

test.afterEach(async ({ page }) => {
  for (const id of created.splice(0)) {
    await deleteFormViaApi(page, id)
  }
})

async function expectAccessible(page: Page, screen: string) {
  // Let transitions (slide-overs, modals, skeletons) settle before scanning.
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(300)

  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    // Dev-server overlays, not part of the app.
    .exclude('nuxt-devtools-frame')
    .exclude('nuxt-error-overlay')
    .analyze()

  const report = violations.map((violation) => ({
    rule: violation.id,
    help: violation.help,
    nodes: violation.nodes.slice(0, 5).map((node) => ({
      target: node.target.join(' '),
      detail: node.any[0]?.message ?? node.failureSummary,
    })),
  }))

  expect.soft(report, `${screen}: ${JSON.stringify(report, null, 2)}`).toEqual([])
}

async function setColorMode(page: Page, mode: 'light' | 'dark') {
  await page.emulateMedia({ colorScheme: mode })
  await page.addInitScript((value) => localStorage.setItem('nuxt-color-mode', value), mode)
}

async function seedForm(page: Page) {
  const form = await createFormViaApi(page, uniqueName('A11y'), {
    schema: schemaFields({
      name: { label: 'Name', rules: ['required'] },
      email: { label: 'Email', rules: ['required', 'email'] },
      topic: { label: 'Topic', rules: ['in:sales,support'] },
    }),
    settings: { honeypot_enabled: true },
  })

  created.push(form.id)
  await page.request.put(`/api/v1/forms/${form.id}`, { data: { name: form.name, active: true } })

  for (const name of ['Ada', 'Grace']) {
    const response = await page.request.post(`/api/v1/forms/${form.id}/entries`, {
      data: { name, email: `${name.toLowerCase()}@example.com`, topic: 'sales' },
    })

    expect(response.status()).toBe(201)
  }

  // A flagged entry, so the Spam badge is scanned too.
  const spam = await page.request.post(`/api/v1/forms/${form.id}/entries`, {
    data: { name: 'Bot', email: 'bot@example.com', topic: 'sales' },
  })

  await page.request.put(`/api/v1/entries/${(await spam.json()).data.id}`, {
    data: { spam: true, spam_score: 0.95, spam_reason: 'Jev classified this entry as spam.' },
  })

  await page.request.post(`/api/v1/forms/${form.id}/notifications`, {
    data: { type: 'email', value: 'alerts@example.com', enabled: true },
  })

  return form
}

for (const mode of ['light', 'dark'] as const) {
  test.describe(`${mode} mode`, () => {
    test.beforeEach(async ({ page }) => {
      await setColorMode(page, mode)
    })

    test('signed-out pages', async ({ page }) => {
      for (const path of ['/login', '/forgot-password', '/reset-password?token=t&email=a@b.co']) {
        await goto(page, path)
        await expectAccessible(page, path)
      }
    })

    test('signed-in pages', async ({ page }) => {
      await signIn(page)
      const form = await seedForm(page)

      const screens = [
        '/forms',
        '/forms/new',
        `/forms/${form.id}/entries`,
        `/forms/${form.id}/entries?status=spam`,
        `/forms/${form.id}/fields`,
        `/forms/${form.id}/settings`,
        `/forms/${form.id}/notifications`,
        `/forms/${form.id}/integrate`,
        '/exports',
        '/account',
        '/forms/01K6NOTAFORM00000000000000',
      ]

      for (const path of screens) {
        await goto(page, path)
        await expectAccessible(page, path)
      }

      await goto(page, `/forms/${form.id}/entries`)
      await page.locator('tbody tr').first().click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await expectAccessible(page, 'entry detail')
    })
  })
}

test('the dashboard at 375 px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await signIn(page)
  const form = await seedForm(page)

  for (const path of ['/forms', `/forms/${form.id}/entries`, `/forms/${form.id}/fields`]) {
    await goto(page, path)
    await expectAccessible(page, `${path} at 375 px`)

    // NFR-5: wide content scrolls inside its container, never the whole page.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )

    expect.soft(overflow, `${path} scrolls horizontally at 375 px`).toBeLessThanOrEqual(0)
  }
})

/** Presses Tab until `target` has focus, failing after `limit` presses. */
async function tabTo(page: Page, target: Locator, limit = 40) {
  for (let presses = 0; presses < limit; presses++) {
    if (await target.evaluate((element) => element === document.activeElement)) {
      return
    }

    await page.keyboard.press('Tab')
  }

  throw new Error(`Tab didn't reach ${target}`)
}

test('the layout works with the keyboard alone at 375 px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await signIn(page)
  await goto(page, '/forms')

  await tabTo(page, page.getByRole('button', { name: 'Open sidebar' }))
  await page.keyboard.press('Enter')

  const sidebar = page.getByRole('dialog')

  await expect(sidebar).toBeVisible()
  await tabTo(page, sidebar.getByRole('link', { name: 'Exports' }))
  await page.keyboard.press('Enter')

  await expect(page).toHaveURL('/exports')
  await expect(page.getByRole('heading', { name: 'Exports' }).first()).toBeVisible()
})

test('focus moves into a modal and back to its trigger', async ({ page }) => {
  await signIn(page)
  const form = await createFormViaApi(page, uniqueName('Focus'))

  created.push(form.id)
  await goto(page, `/forms/${form.id}/notifications`)

  const trigger = page.getByRole('button', { name: 'Add recipient' }).first()

  await tabTo(page, trigger)
  await page.keyboard.press('Enter')

  const modal = page.getByRole('dialog')

  await expect(modal).toBeVisible()
  await expect
    .poll(() => modal.evaluate((dialog) => dialog.contains(document.activeElement)))
    .toBe(true)

  await page.keyboard.press('Escape')
  await expect(modal).toBeHidden()
  await expect(trigger).toBeFocused()
})
