import js from '@eslint/js'
import importPlugin from 'eslint-plugin-import-x'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

// Only brand names that actually exist as of Epic 1 (PR 1.2). ColorToken / SpaceToken /
// BreakpointToken from spec §6.1 are deferred — the design-system Phase 1 uses `as const`
// without nominal brands. Add them here when those brands land (Epic 3 or later).
const BRAND_NAMES = 'ResortSlug|UpstreamHash|ISOCountryCode|ISODateTimeString'
const COLOR_LITERAL = '^(#[0-9a-fA-F]{3,8}|(rgb|rgba|hsl|hsla|oklch)\\()'
const RAW_HTML_ELS = '^(button|input|a|dialog|select|textarea)$'

const BRAND_CAST_SELECTOR = `TSAsExpression[typeAnnotation.typeName.name=/^(${BRAND_NAMES})$/]`

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      '**/dist/**',
      'node_modules/**',
      '**/node_modules/**',
      'coverage/**',
      '**/coverage/**',
      '.worktrees/**',
      'packages/design-system/tokens.css',
    ],
  },

  js.configs.recommended,

  // TS-aware rules across all our source/test code
  {
    files: [
      'apps/**/*.{ts,tsx}',
      'packages/**/*.{ts,tsx}',
      'tests/**/*.{ts,tsx}',
      'config/**/*.ts',
      'scripts/**/*.ts',
    ],
    extends: [
      tseslint.configs.strictTypeChecked,
      importPlugin.flatConfigs.recommended,
      importPlugin.flatConfigs.typescript,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      'react/jsx-key': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      'react-refresh/only-export-components': 'error',
      '@typescript-eslint/explicit-function-return-type': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/prefer-readonly': 'error',
      '@typescript-eslint/no-shadow': 'error',
      '@typescript-eslint/no-restricted-types': [
        'error',
        {
          types: {
            Object: { message: 'Use object or a specific shape.' },
            Function: { message: 'Use a specific function signature.' },
            '{}': {
              message: 'Use Record<string, unknown> or a specific shape.',
            },
          },
        },
      ],
      'no-console': 'error',
      eqeqeq: 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'no-param-reassign': 'error',
      'no-implicit-coercion': 'error',
      'no-nested-ternary': 'error',
      curly: 'error',
      'object-shorthand': 'error',
      'no-else-return': 'error',
      'import-x/order': [
        'error',
        {
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'import-x/no-cycle': 'error',
      'import-x/no-duplicates': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: BRAND_CAST_SELECTOR,
          message:
            'Brand types must be obtained via Schema.parse / Schema.safeParse, not `as`. See spec §4.2.',
        },
      ],
    },
    settings: { react: { version: 'detect' } },
  },

  // Package DAG (§5.3). schema is the leaf — no other workspace imports allowed.
  {
    files: ['packages/schema/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@snowboard-trip-advisor/design-system',
                '@snowboard-trip-advisor/integrations',
                '@snowboard-trip-advisor/public-app',
                '@snowboard-trip-advisor/admin-app',
              ],
              message:
                'packages/schema is the leaf — it must not import from other workspaces.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/design-system/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@snowboard-trip-advisor/integrations',
                '@snowboard-trip-advisor/public-app',
                '@snowboard-trip-advisor/admin-app',
              ],
              message: 'design-system depends only on schema.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/integrations/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@snowboard-trip-advisor/design-system',
                '@snowboard-trip-advisor/public-app',
                '@snowboard-trip-advisor/admin-app',
              ],
              message: 'integrations depends only on schema.',
            },
          ],
        },
      ],
    },
  },

  // Design-system discipline applied to apps and admin (§6.3).
  // Re-list the brand-cast selector here because flat-config rule arrays
  // overwrite rather than merge — without re-listing, the apps block would
  // disable brand-cast enforcement for apps/**.
  {
    files: ['apps/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: BRAND_CAST_SELECTOR,
          message: 'Brand types via Schema.parse only.',
        },
        {
          selector: `Literal[value=/${COLOR_LITERAL}/]`,
          message:
            'Raw color literals are forbidden in apps/**. Use design-system tokens.',
        },
        {
          selector: `JSXOpeningElement[name.name=/${RAW_HTML_ELS}/]`,
          message:
            'Use design-system wrappers (Button, Input, …) instead of raw HTML elements.',
        },
      ],
    },
  },

  // CLI / migration / scripts: console allowed.
  {
    files: [
      'research/cli.ts',
      'research/cli.test.ts',
      'research/migrate/**/*.ts',
      'scripts/**/*.ts',
    ],
    rules: { 'no-console': 'off' },
  },

  // ESLint config self-tests use virtual filenames with the sentinel basename
  // `__eslint_fixture__`. Disable the type-aware projectService for these so
  // `eslint.lintText({ filePath: '…/__eslint_fixture__.ts' }, …)` does not fail
  // with "file was not found by the project service". The fixture filenames are
  // routed through the package DAG and apps `no-restricted-syntax` blocks above
  // for glob-based rule selection — only the parser + type-aware rules change here.
  {
    files: ['**/__eslint_fixture__.{ts,tsx}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { parserOptions: { projectService: false, project: null } },
    rules: {
      // import-x/no-cycle uses TS resolver internals and breaks under
      // disableTypeChecked too; the fixture asserts simple syntactic rules.
      'import-x/no-cycle': 'off',
    },
  },
)
