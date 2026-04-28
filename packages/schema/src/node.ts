// Node-only entry point — exports utilities that depend on node:fs / node:path /
// node:crypto. apps/public must NOT import from this entry. Two layers protect
// the browser bundle:
//
//   1. The package root (`'@snowboard-trip-advisor/schema'`) no longer re-exports
//      `loadResortDataset` / `publishDataset`, so the browser bundle is
//      structurally safe even before ESLint runs (the bundler follows
//      re-exports statically; see PR 3.1c Phase F build trace).
//
//   2. ESLint's `no-restricted-imports` block in eslint.config.js bans
//      `loadResortDataset` and `publishDataset` from BOTH the package root
//      AND this `/node` subpath when imported from `apps/public/**`. A
//      companion `no-restricted-syntax` selector blocks dynamic
//      `import('@snowboard-trip-advisor/schema/node')` so the bypass is
//      closed for code-split chunks too.
//
// apps/admin runs on Node (loopback-only, full fs access) and is allowed to
// import from this entry. apps/public/**/*.test.{ts,tsx} files run under Node
// + jsdom and are exempted from the ban (the test code never reaches the
// production bundle).
export * from './loadResortDataset'           // PR 2.4: loadResortDataset (Node fs wrapper) + LoadResult
export * from './publishDataset'              // PR 2.3: publishDataset + PublishResult + PublishOptions
