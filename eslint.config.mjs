import { defineConfig } from 'eslint/config'
import tseslint from '@electron-toolkit/eslint-config-ts'
import eslintConfigPrettier from '@electron-toolkit/eslint-config-prettier'
import eslintPluginVue from 'eslint-plugin-vue'
import vueParser from 'vue-eslint-parser'

export default defineConfig(
  { ignores: ['**/node_modules', '**/dist', '**/out', '**/release', '.eslintcache', 'scripts/**'] },
  tseslint.configs.recommended,
  eslintPluginVue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        extraFileExtensions: ['.vue'],
        parser: tseslint.parser
      }
    }
  },
  {
    files: ['**/*.{ts,mts,tsx,vue}'],
    rules: {
      'vue/require-default-prop': 'off',
      'vue/multi-word-component-names': 'off',
      'vue/block-lang': ['error', { script: { lang: 'ts' } }]
    }
  },
  {
    // Le domaine reste du TypeScript pur : ni Vue, ni Pinia, ni Electron, ni Node, ni couche supérieure.
    files: ['src/domain/**/*.ts'],
    ignores: ['src/domain/**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'vue',
                'vue/*',
                'pinia',
                'electron',
                'electron/*',
                'node:*',
                'fs',
                'fs/*',
                'path',
                'os'
              ],
              message: 'src/domain ne dépend ni de Vue, ni d’Electron, ni de Node.'
            },
            {
              group: [
                '@/app/*',
                '@/features/*',
                '@/io/*',
                '@/render/*',
                '@/state/*',
                '@/ui/*',
                '**/app/*',
                '**/features/*',
                '**/io/*',
                '**/render/*',
                '**/state/*',
                '**/ui/*'
              ],
              message: 'src/domain n’importe rien des couches supérieures.'
            }
          ]
        }
      ]
    }
  },
  eslintConfigPrettier
)
