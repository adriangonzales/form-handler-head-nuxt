// The environment that points the dashboard, and its tests, at the mock backend on `port`. Values
// in .env are overridden where they would point elsewhere: these are set in the environment, which
// takes precedence over .env for Nuxt, Playwright and the test helpers.

/** @param {string} port */
export function mockBackendEnv(port) {
  const apiUrl = `http://127.0.0.1:${port}/api`

  return {
    MOCK_BACKEND_PORT: port,
    NUXT_API_BASE: apiUrl,
    API_DOCS_URL: `http://127.0.0.1:${port}/docs/api.json`,
    NUXT_PUBLIC_API_PUBLIC_BASE: apiUrl,
    NUXT_SESSION_PASSWORD:
      process.env.NUXT_SESSION_PASSWORD || 'mock-backend-session-password-not-for-real-use',
    // The mock's own sign-up for test users (the contract has none).
    E2E_CREATE_USER_CMD: `curl -sf -X POST http://127.0.0.1:${port}/__mock/users -H 'Content-Type: application/json' -d '{"name":"{name}","email":"{email}","password":"{password}"}'`,
  }
}
