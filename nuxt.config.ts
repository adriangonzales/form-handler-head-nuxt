// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  modules: ['@nuxt/ui', '@nuxt/eslint', '@nuxt/test-utils/module', 'nuxt-auth-utils'],

  css: ['~/assets/css/main.css'],

  app: {
    head: { htmlAttrs: { lang: 'en' } },
  },

  // Values come from `.env` (see `.env.example`), which Nuxt loads before reading this file. The
  // same NUXT_* variables still override them at runtime in production.
  runtimeConfig: {
    // API base, called only from the Nitro server. Use the API's public origin so the
    // signed export `download_url`s builds point somewhere browsers can reach.
    apiBase: process.env.NUXT_API_BASE ?? '',
    auth: {
      // Refresh the API token when it expires within this many seconds.
      refreshAheadSeconds: Number(process.env.NUXT_AUTH_REFRESH_AHEAD_SECONDS) || 120,
    },
    session: {
      // Keep equal to the API's JWT_REFRESH_TTL, so a session never outlives a refreshable token.
      maxAge: Number(process.env.NUXT_SESSION_MAX_AGE) || 60 * 60 * 24 * 7,
    },
    public: {
      // Base URL shown in embed snippets and used by the test-submit tool.
      apiPublicBase: process.env.NUXT_PUBLIC_API_PUBLIC_BASE ?? '',
      // Shown under "New password". Match the API environment's password policy: Laravel's
      // defaults there are 8 characters, or the stricter rules below in production.
      passwordRequirements:
        process.env.NUXT_PUBLIC_PASSWORD_REQUIREMENTS ?? 'Use at least 8 characters.',
    },
  },

  typescript: {
    strict: true,
    // Typecheck tests too, so `expectTypeOf` assertions on the generated API types are enforced.
    tsConfig: {
      include: ['../tests/**/*'],
    },
  },
})
