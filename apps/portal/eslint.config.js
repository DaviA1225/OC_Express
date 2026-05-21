import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // O react-hook-form expõe `watch()` que o React Compiler considera não
      // memoizável. A solução idiomática é trocar por `useWatch({ control })`,
      // mas como o compiler ainda não está ativo no Vite/Babel deste app, o
      // warning só polui. Religar (e refatorar) junto com a ativação do
      // React Compiler.
      'react-hooks/incompatible-library': 'off',
    },
  },
])
