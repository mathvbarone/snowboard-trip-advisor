export default [
  'apps/public',
  'apps/admin',
  'packages/schema',
  'packages/design-system',
  'packages/integrations',
  // Root project — runs only `scripts/**/*.test.ts` (see root `vitest.config.ts`
  // `test.include`). Lets `scripts/generate-tokens.test.ts` participate in the
  // global coverage gate without belonging to a package workspace.
  '.',
]
