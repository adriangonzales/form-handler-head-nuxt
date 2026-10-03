/**
 * The Backend's OpenAPI spec URL: API_DOCS_URL, or NUXT_API_BASE with a trailing `/api` replaced
 * by `/docs/api.json`.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {string | undefined}
 */
export function specUrlFrom(env) {
  if (env.API_DOCS_URL) return env.API_DOCS_URL

  const apiUrl = env.NUXT_API_BASE?.replace(/\/+$/, '')

  return apiUrl ? `${apiUrl.replace(/\/api$/, '')}/docs/api.json` : undefined
}
