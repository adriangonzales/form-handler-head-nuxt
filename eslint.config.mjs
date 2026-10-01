// @ts-check
import prettier from 'eslint-config-prettier'
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(prettier).append({
  ignores: ['shared/types/api.d.ts'],
})
