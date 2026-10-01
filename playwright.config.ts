import { defineConfig, devices } from '@playwright/test'

// Load E2E_EMAIL / E2E_PASSWORD and the API settings from .env when present.
try {
  process.loadEnvFile('.env')
} catch {
  // No .env: rely on the environment (CI).
}

const port = 3100

/**
 * E2E runs against the local Laravel API (with the E2E test user) and a dedicated Nuxt dev server
 * on :3100, so it never reuses a dev server started with different settings.
 *
 * NUXT_AUTH_REFRESH_AHEAD_SECONDS is above the API's 60-minute token lifetime, so the server
 * refreshes the token on every request: every test also exercises token refresh.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `./node_modules/.bin/nuxt dev --port ${port}`,
    url: `http://localhost:${port}/login`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { NUXT_AUTH_REFRESH_AHEAD_SECONDS: '4000' },
  },
})
