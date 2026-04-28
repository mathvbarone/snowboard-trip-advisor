// Node-only entry point — exports utilities that depend on node:fs / node:path /
// node:crypto. apps/public must NOT import from this entry; the ESLint
// no-restricted-imports rule blocks `loadResortDataset` from the package root,
// and the package root no longer re-exports `loadResortDataset` /
// `publishDataset` so the browser bundle is structurally safe even before
// ESLint runs (matters because the bundler follows re-exports statically; see
// PR 3.1c Phase F build trace).
export * from './loadResortDataset'           // PR 2.4: loadResortDataset (Node fs wrapper) + LoadResult
export * from './publishDataset'              // PR 2.3: publishDataset + PublishResult + PublishOptions
