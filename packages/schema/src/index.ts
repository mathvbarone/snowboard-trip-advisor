// Browser-safe entry point for @snowboard-trip-advisor/schema. Pulls only the
// modules that compile to platform-agnostic ESM (Zod schemas, type aliases,
// the pure dataset projector).
//
// Node-only utilities (`loadResortDataset` — node:fs reader; `publishDataset`
// — atomic publisher with node:crypto + node:fs + node:path) live behind the
// `./node` subpath export. The split is structural: even with Rollup's
// tree-shaking, an `export *` re-export from this file would force the
// bundler to evaluate the Node-only modules' top-level node:* imports against
// Vite's `__vite-browser-external` shim and crash on the un-shimmed `join`,
// `readFile`, etc. Keeping the boundary at the package level — not the
// re-export-list level — makes the apps/public bundle structurally
// browser-safe before ESLint runs.
//
// Tests / Node call sites (admin app, integration tests) import from
// `@snowboard-trip-advisor/schema/node` for the Node-only surface.

export * from './branded'
export * from './primitives'
export * from './metricFields'
export * from './resort'
export * from './liveSignal'
export * from './published'
export * from './validatePublishedDataset'
export * from './resortView'
export * from './loadResortDatasetFromObject'
