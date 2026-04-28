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
// Color literals are emitted by the design-system tokens.css generator only.
// Apps must reference tokens via CSS custom properties (var(--color-...)) — never
// hex/rgb/hsl/oklch literals. Two separate patterns instead of one folded group
// so each branch carries its own ^…$ anchors (otherwise the hex branch would
// over-fire on SHA prefixes / UUID-shaped strings).
const COLOR_HEX_LITERAL = '^#[0-9a-fA-F]{3,8}$'
const COLOR_FN_LITERAL = '^(rgb|rgba|hsl|hsla|oklch)\\('
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
            {
              group: [
                '@snowboard-trip-advisor/*/internals/*',
                '@snowboard-trip-advisor/*/internal/*',
              ],
              message:
                'Deep imports into other workspaces are banned. Use the package root entry only (spec §6.3 line 483).',
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
            {
              group: [
                '@snowboard-trip-advisor/*/internals/*',
                '@snowboard-trip-advisor/*/internal/*',
              ],
              message:
                'Deep imports into other workspaces are banned. Use the package root entry only (spec §6.3 line 483).',
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
            {
              group: [
                '@snowboard-trip-advisor/*/internals/*',
                '@snowboard-trip-advisor/*/internal/*',
              ],
              message:
                'Deep imports into other workspaces are banned. Use the package root entry only (spec §6.3 line 483).',
            },
          ],
        },
      ],
    },
  },

  // Apps consume packages but must not deep-import internals (§6.3 line 483).
  {
    files: ['apps/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@snowboard-trip-advisor/*/internals/*',
                '@snowboard-trip-advisor/*/internal/*',
              ],
              message:
                'Deep imports into packages are banned. Import from the package root only (spec §6.3 line 483).',
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
          selector: `Literal[value=/${COLOR_HEX_LITERAL}/]`,
          message:
            'Raw hex color literals are forbidden in apps/**. Use design-system tokens (var(--color-...)).',
        },
        {
          selector: `Literal[value=/${COLOR_FN_LITERAL}/]`,
          message:
            'Raw rgb/hsl/oklch color literals are forbidden in apps/**. Use design-system tokens.',
        },
        {
          selector: `JSXOpeningElement[name.name=/${RAW_HTML_ELS}/]`,
          message:
            'Use design-system wrappers (Button, Input, …) instead of raw HTML elements.',
        },
      ],
    },
  },

  // apps/public-only ban: the path-taking `loadResortDataset` and `publishDataset`
  // reach for node:fs/promises and must never end up in the browser bundle. The
  // browser-safe `loadResortDatasetFromObject` is the intended entry point for
  // the public app.
  //
  // Two specifiers must be banned:
  //   1. `'@snowboard-trip-advisor/schema'`  — package root re-exports were
  //      narrowed in PR 3.1c so `loadResortDataset` and `publishDataset` no
  //      longer come through here, but the named-import ban is kept as a
  //      defense-in-depth tripwire in case a future re-export regression
  //      widens the surface again.
  //   2. `'@snowboard-trip-advisor/schema/node'`  — the dedicated Node-only
  //      subpath where `loadResortDataset` and `publishDataset` actually live.
  //      Without an explicit ban, apps/public could import from this subpath
  //      and the browser bundle would pull `node:fs/promises` at module
  //      evaluation time and crash at `vite build`.
  //
  // Test files (*.test.{ts,tsx}) are exempted because they run under Node
  // (vitest + jsdom), not in the production browser bundle — the bundle-safety
  // motivation does not apply.
  //
  // Flat-config rule arrays overwrite rather than merge, so:
  //   - the deep-import patterns from the apps/** block above are re-listed
  //     under `no-restricted-imports` (without that, apps/public/** would
  //     silently lose the deep-import ban);
  //   - the brand-cast / color-literal / raw-HTML selectors from the apps/**
  //     block above are re-listed under `no-restricted-syntax` for the same
  //     reason — and this block is placed AFTER the apps/** block so the
  //     dynamic-import selector below survives the merge for apps/public/**.
  {
    files: ['apps/public/**/*.{ts,tsx}'],
    ignores: ['apps/public/**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@snowboard-trip-advisor/*/internals/*',
                '@snowboard-trip-advisor/*/internal/*',
              ],
              message:
                'Deep imports into packages are banned. Import from the package root only (spec §6.3 line 483).',
            },
          ],
          paths: [
            {
              name: '@snowboard-trip-advisor/schema',
              importNames: ['loadResortDataset', 'publishDataset'],
              message:
                'Use loadResortDatasetFromObject in apps/public to keep node:fs/promises out of the browser bundle. See spec §2.2.',
            },
            {
              name: '@snowboard-trip-advisor/schema/node',
              importNames: ['loadResortDataset', 'publishDataset'],
              message:
                "The '/node' subpath carries Node-only utilities (node:fs/promises). Use loadResortDatasetFromObject from '@snowboard-trip-advisor/schema' (the package root) instead — it's browser-safe and was designed for apps/public's runtime fetch path. See spec §2.2.",
            },
          ],
        },
      ],
      // Companion to the `no-restricted-imports` rule above: ESLint's
      // `no-restricted-imports` only matches static `import` declarations, so
      // `await import('@snowboard-trip-advisor/schema')` (or `/schema/node`)
      // would silently bypass the bundle-safety ban and reintroduce
      // node:fs/promises into the browser bundle. Block ALL dynamic imports
      // of the schema package OR its `/node` subpath from apps/public —
      // code-split chunks (matrix view, detail drawer) are SPA-internal and
      // have no legitimate need to dynamic-import either specifier, so the
      // broader ban closes the bypass with one selector.
      //
      // The four selectors after it are re-listed verbatim from the apps/**
      // block above; flat-config rule arrays overwrite rather than merge, so
      // dropping them here would silently disable brand-cast / color-literal
      // / raw-HTML enforcement for apps/public/**.
      'no-restricted-syntax': [
        'error',
        {
          // esquery selector with a regex literal. Forward slashes inside
          // the regex need backslash-escaping (`\/`); inside this JS string
          // each becomes `\\/`. Pattern matches the package root specifier
          // and its `/node` subpath; the bare-package, named-import case is
          // covered by `no-restricted-imports` above.
          selector:
            'ImportExpression[source.value=/^@snowboard-trip-advisor\\/schema(\\/node)?$/]',
          message:
            "Use a static import in apps/public to keep node:fs/promises out of the browser bundle. Dynamic imports of '@snowboard-trip-advisor/schema' or '@snowboard-trip-advisor/schema/node' bypass the bundle-safety check on loadResortDataset / publishDataset (see eslint.config.js no-restricted-imports above and spec §2.2).",
        },
        {
          selector: BRAND_CAST_SELECTOR,
          message: 'Brand types via Schema.parse only.',
        },
        {
          selector: `Literal[value=/${COLOR_HEX_LITERAL}/]`,
          message:
            'Raw hex color literals are forbidden in apps/**. Use design-system tokens (var(--color-...)).',
        },
        {
          selector: `Literal[value=/${COLOR_FN_LITERAL}/]`,
          message:
            'Raw rgb/hsl/oklch color literals are forbidden in apps/**. Use design-system tokens.',
        },
        {
          selector: `JSXOpeningElement[name.name=/${RAW_HTML_ELS}/]`,
          message:
            'Use design-system wrappers (Button, Input, …) instead of raw HTML elements.',
        },
      ],
    },
  },

  // Scripts (token generator, future generators) may use console; CLI/research
  // overrides will be reintroduced in Epic 5 PR 5.1 when research/cli.ts lands.
  {
    files: ['scripts/**/*.ts'],
    rules: { 'no-console': 'off' },
  },

  // ESLint config self-tests use virtual filenames with the sentinel basename
  // `__eslint_fixture__` (and `__eslint_fixture__.test.{ts,tsx}` for tests that
  // need to assert against the *.test.* glob carve-outs in other rule blocks).
  // Disable the type-aware projectService for these so `eslint.lintText` does
  // not fail with "file was not found by the project service". The fixture
  // filenames are routed through the package DAG and apps `no-restricted-syntax`
  // blocks above for glob-based rule selection — only the parser + type-aware
  // rules change here.
  {
    files: ['**/__eslint_fixture__.{ts,tsx}', '**/__eslint_fixture__.test.{ts,tsx}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { parserOptions: { projectService: false, project: null } },
    rules: {
      // import-x/no-cycle uses TS resolver internals and breaks under
      // disableTypeChecked too; the fixture asserts simple syntactic rules.
      'import-x/no-cycle': 'off',
    },
  },
)
