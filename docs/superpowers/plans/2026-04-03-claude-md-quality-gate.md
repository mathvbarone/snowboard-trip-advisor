# CLAUDE.md Quality Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a strict automated quality gate to the project — ESLint strict config, 100% Vitest coverage, a pre-commit hook, and a CLAUDE.md that makes the rules unambiguous for agents.

**Architecture:** A single `npm run qa` command chains lint → typecheck → coverage. A shell script at `scripts/pre-commit` is installed into `.git/hooks/` by `npm run setup` and runs the full gate on every commit. All lint violations and coverage gaps in the existing codebase are fixed as part of this plan before CLAUDE.md is written.

**Tech Stack:** ESLint 9 flat config, typescript-eslint strict type-checked, eslint-plugin-react-hooks, eslint-plugin-react-refresh, @vitest/coverage-v8

---

## Planned File Structure

- `eslint.config.js` — Create: flat ESLint config with strict type-aware rules
- `scripts/pre-commit` — Create: version-controlled pre-commit hook source
- `CLAUDE.md` — Create: agent instructions and quality gate rules
- `package.json` — Modify: add lint, typecheck, coverage, qa, setup scripts
- `tsconfig.json` — Modify: add Node types so typecheck can cover publish/CLI files
- `vite.config.ts` — Modify: add coverage block and worktree exclusion
- `research/normalize/normalizeResort.ts` — Modify: lint fixes (return types, strict-boolean)
- `research/scoring/computeScores.ts` — Modify: lint fixes (return types, named result type)
- `research/reports/buildChangeReport.ts` — Modify: lint fixes (return types, typed signature)
- `research/validate/validatePublishedDataset.ts` — Modify: lint fixes (return type, strict-boolean)
- `research/publish/publishDataset.ts` — Modify: lint fixes (return types)
- `research/cli.ts` — Modify: lint fixes (remove async from runCli, void floating promise)
- `research/sources/sourceRegistry.ts` — Modify: lint fix (explicit type annotation)
- `research/targets.ts` — Modify: lint fix (explicit type annotation)
- `research/schema.ts` — Modify: lint fixes (return types on helpers)
- `src/App.tsx` — Modify: lint fixes (return type, void floating promise, strict-boolean)
- `src/components/Hero.tsx` — Modify: lint fix (return type)
- `src/components/FilterBar.tsx` — Modify: lint fix (return type)
- `src/components/ComparePanel.tsx` — Modify: lint fix (return type)
- `src/components/ResortGrid.tsx` — Modify: lint fix (return type)
- `src/components/ResortCard.tsx` — Modify: lint fix (return type)
- `src/components/ResortDetailDrawer.tsx` — Modify: lint fix (return type)
- `src/data/loadPublishedDataset.ts` — Modify: lint fix (return type already present; add error branch test)
- `src/lib/queryState.ts` — Modify: lint fixes (return types on all functions)
- `src/lib/format.ts` — Modify: lint fix (return type on createFormatter)
- `src/lib/format.test.ts` — Create: full coverage of all formatters
- `src/components/Hero.test.tsx` — Create: render test
- `src/components/ResortCard.test.tsx` — Create: render test with full resort fixture
- `src/components/ResortGrid.test.tsx` — Create: empty state + populated state
- `src/components/ResortDetailDrawer.test.tsx` — Create: null + resort states
- `src/components/ComparePanel.test.tsx` — Modify: add empty state test
- `src/data/loadPublishedDataset.test.ts` — Modify: add failed response branch test
- `src/lib/queryState.test.ts` — Modify: add empty-input branches
- `research/validate/validatePublishedDataset.test.ts` — Create: error branch tests
- `research/reports/buildChangeReport.test.ts` — Modify: add created-record branch test
- `research/schema.test.ts` — Modify: add sourceRegistry and targets import coverage

---

### Task 1: Install Dependencies And Add Package Scripts

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Install new dev dependencies**

```bash
cd /home/math/Projects/snowboard-trip-advisor
npm install --save-dev eslint @eslint/js typescript-eslint eslint-plugin-react-hooks eslint-plugin-react-refresh @vitest/coverage-v8 @types/node
```

Expected: packages added to `node_modules/`. Engine warnings may appear because the local Node version is older than the newest Vite plugin recommendation, but dependency installation should still complete successfully.

- [ ] **Step 2: Add scripts to package.json**

Replace the `"scripts"` block in `package.json` with:

```json
"scripts": {
  "dev": "vite",
  "build": "vite build",
  "lint": "eslint .",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "test:watch": "vitest",
  "coverage": "vitest run --coverage",
  "qa": "npm run lint && npm run typecheck && npm run coverage",
  "setup": "cp scripts/pre-commit .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit",
  "research": "tsx research/cli.ts"
}
```

- [ ] **Step 3: Verify scripts resolve**

```bash
npm run typecheck
```

Expected: this may still fail at this stage because `vite.config.ts` and `tsconfig.json` are corrected in Task 2. The goal here is to confirm the script exists and capture any remaining config blockers, not to require a green typecheck before Task 2.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add lint coverage and qa scripts with new dev deps"
```

---

### Task 2: Write ESLint Config And Update Vite Config

**Files:**
- Create: `eslint.config.js`
- Modify: `tsconfig.json`
- Modify: `vite.config.ts`

- [ ] **Step 1: Write eslint.config.js**

```js
// eslint.config.js
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', '.worktrees/**', 'coverage/**'],
  },
  js.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}', 'research/**/*.{ts,tsx}', 'config/**/*.ts'],
    extends: tseslint.configs.strictTypeChecked,
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // React
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      'react-refresh/only-export-components': 'error',

      // TypeScript additions beyond strictTypeChecked
      '@typescript-eslint/explicit-function-return-type': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports' },
      ],
      '@typescript-eslint/prefer-readonly': 'error',
      '@typescript-eslint/no-shadow': 'error',

      // Base rules
      'no-console': 'error',
      'eqeqeq': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'no-param-reassign': 'error',
      'no-implicit-coercion': 'error',
      'no-nested-ternary': 'error',
      'curly': 'error',
      'object-shorthand': 'error',
      'no-else-return': 'error',
    },
  },
  {
    // CLI is a console program — console is its correct output mechanism
    files: ['research/cli.ts', 'research/cli.test.ts'],
    rules: {
      'no-console': 'off',
    },
  },
)
```

- [ ] **Step 2: Run lint to verify config loads without errors**

```bash
npm run lint 2>&1 | head -40
```

Expected: ESLint outputs lint violations (not config parse errors). If you see "Error: Cannot find module" or "Invalid configuration", fix the config before continuing. Violations are expected at this stage.

- [ ] **Step 3: Update vite.config.ts with coverage and worktree exclusion**

```ts
// vite.config.ts
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    globals: true,
    exclude: ['node_modules/**', '.worktrees/**'],
    coverage: {
      provider: 'v8',
      include: ['src/**', 'research/**'],
      exclude: [
        'src/main.tsx',
        'src/test/**',
        'research/sources/fetchText.ts',
        'config/scoring.ts',
        '**/*.test.{ts,tsx}',
        '**/__fixtures__/**',
        '**/*.d.ts',
      ],
      thresholds: {
        lines: 100,
        branches: 100,
        functions: 100,
        statements: 100,
      },
      reporter: ['text', 'lcov'],
    },
  },
})
```

- [ ] **Step 4: Update tsconfig.json for Node-aware typecheck**

Add `'node'` to the `compilerOptions.types` array so TypeScript can resolve `node:*` imports used by the publish pipeline:

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "Bundler",
    "allowImportingTsExtensions": false,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "types": ["node", "vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src", "research", "config", "vite.config.ts"]
}
```

- [ ] **Step 5: Run tests to verify worktree exclusion**

```bash
npm test 2>&1 | grep "Test Files"
```

Expected: only the real project tests are counted. At the current repo state, that should be `Test Files  11 passed (11)` before any new quality-gate tests are added.

- [ ] **Step 6: Re-run typecheck**

```bash
npm run typecheck
```

Expected: exits 0. If it still fails, fix the TypeScript config before moving on to lint-fix tasks.

- [ ] **Step 7: Commit**

```bash
git add eslint.config.js vite.config.ts tsconfig.json
git commit -m "chore: add eslint flat config and vitest coverage gate"
```

---

### Task 3: Write Pre-Commit Hook And Setup Script

**Files:**
- Create: `scripts/pre-commit`

- [ ] **Step 1: Create scripts directory and write hook**

```bash
mkdir -p scripts
```

```sh
#!/bin/sh
# scripts/pre-commit
npm run qa
```

- [ ] **Step 2: Run setup to install the hook**

```bash
npm run setup
```

- [ ] **Step 3: Verify hook is installed and executable**

```bash
ls -la .git/hooks/pre-commit
```

Expected: `-rwxr-xr-x ... .git/hooks/pre-commit`

- [ ] **Step 4: Commit**

```bash
git add scripts/pre-commit
git commit -m "chore: add version-controlled pre-commit hook"
```

---

### Task 4: Fix Lint Violations In Research Files

**Files:**
- Modify: `research/normalize/normalizeResort.ts`
- Modify: `research/scoring/computeScores.ts`
- Modify: `research/reports/buildChangeReport.ts`
- Modify: `research/validate/validatePublishedDataset.ts`
- Modify: `research/publish/publishDataset.ts`
- Modify: `research/cli.ts`
- Modify: `research/sources/sourceRegistry.ts`
- Modify: `research/targets.ts`
- Modify: `research/schema.ts`

- [ ] **Step 1: Run lint on research files to see all violations**

```bash
npm run lint -- --max-warnings=0 research/ 2>&1
```

Expected: Many violations across files. Note them — the steps below fix them all.

- [ ] **Step 2: Rewrite research/normalize/normalizeResort.ts**

```ts
// research/normalize/normalizeResort.ts
export type SourceField = {
  value: number | string
  source: string
  retrieved_at: string
  confidence: number
  notes?: string
}

export type SourceRecord = {
  id: string
  name: string
  country: string
  region: string
  source_urls: string[]
  fields: Record<string, SourceField>
}

type ParsedField = {
  field: SourceField
  value: number
}

type NormalizedResort = {
  id: string
  name: string
  country: string
  region: string
  status: 'active'
  overall_confidence: number
  source_urls: string[]
  field_sources: Record<string, { source: string; retrieved_at: string; confidence: number; notes?: string }>
  piste_km: number
  lift_pass_day_eur: number
}

function requireField(source: SourceRecord, key: string): SourceField {
  const field = source.fields[key]

  if (field === undefined) {
    throw new Error(`Missing required field: ${key}`)
  }

  return field
}

function parseNumericField(source: SourceRecord, key: string): ParsedField {
  const field = requireField(source, key)

  if (typeof field.value === 'string' && field.value.trim() === '') {
    throw new Error(`Invalid numeric value for field: ${key}`)
  }

  const parsed = typeof field.value === 'number' ? field.value : Number(field.value)

  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid numeric value for field: ${key}`)
  }

  return { field, value: parsed }
}

export function normalizeResort(source: SourceRecord): NormalizedResort {
  const pisteKm = parseNumericField(source, 'piste_km')
  const liftPassDay = parseNumericField(source, 'lift_pass_day_eur')

  return {
    id: source.id,
    name: source.name,
    country: source.country,
    region: source.region,
    status: 'active',
    overall_confidence: 0.9,
    source_urls: source.source_urls,
    field_sources: {
      piste_km: {
        source: pisteKm.field.source,
        retrieved_at: pisteKm.field.retrieved_at,
        confidence: pisteKm.field.confidence,
        notes: pisteKm.field.notes,
      },
      lift_pass_day_eur: {
        source: liftPassDay.field.source,
        retrieved_at: liftPassDay.field.retrieved_at,
        confidence: liftPassDay.field.confidence,
        notes: liftPassDay.field.notes,
      },
    },
    piste_km: pisteKm.value,
    lift_pass_day_eur: liftPassDay.value,
  }
}
```

- [ ] **Step 3: Rewrite research/scoring/computeScores.ts**

```ts
// research/scoring/computeScores.ts
import {
  scoreWeights,
  sizeThresholds,
  skiOnlyPriceThresholds,
  tripPriceThresholds,
} from '../../config/scoring'

type Boundary = { min: number; max: number }

type ScoringBoundaries = {
  piste_km: Boundary
  lift_pass_day_eur: Boundary
  estimated_trip_cost_3_days_eur: Boundary
}

type SizeCategory = 'Small' | 'Medium' | 'Large' | 'Mega'
type PriceCategory = 'Budget' | 'Midrange' | 'Premium' | 'Luxury'

type ScoredFields = {
  size_category_official: SizeCategory
  size_category_practical: SizeCategory
  price_category_ski_only: PriceCategory | undefined
  price_category_trip_cost: PriceCategory | undefined
  size_score: number
  value_score: number
  snow_score: number
  access_score: number
  overall_score: number
}

type ScoreResult<T> = {
  resorts: Array<T & ScoredFields>
  boundaries: ScoringBoundaries
}

type ResortInput = {
  piste_km?: number
  vertical_drop_m?: number
  lift_count?: number
  lift_pass_day_eur?: number
  estimated_trip_cost_3_days_eur?: number
  snow_reliability_proxy?: number
  transfer_complexity?: number
}

function minMax(values: number[]): Boundary {
  if (values.length === 0) {
    return { min: 0, max: 0 }
  }

  return { min: Math.min(...values), max: Math.max(...values) }
}

function normalize(
  value: number | undefined,
  boundary: Boundary,
  invert = false,
): number {
  if (value === undefined) {
    return 0
  }

  if (boundary.max === boundary.min) {
    return 1
  }

  const raw = (value - boundary.min) / (boundary.max - boundary.min)
  return invert ? 1 - raw : raw
}

function definedNumbers(values: Array<number | undefined>): number[] {
  return values.filter((value): value is number => value !== undefined)
}

function sizeBucket(
  value: number,
  thresholds: { medium: number; large: number; mega: number },
): SizeCategory {
  if (value >= thresholds.mega) {
    return 'Mega'
  }

  if (value >= thresholds.large) {
    return 'Large'
  }

  if (value >= thresholds.medium) {
    return 'Medium'
  }

  return 'Small'
}

function priceBucket(
  value: number,
  thresholds: { budget: number; midrange: number; premium: number },
): PriceCategory {
  if (value <= thresholds.budget) {
    return 'Budget'
  }

  if (value <= thresholds.midrange) {
    return 'Midrange'
  }

  if (value <= thresholds.premium) {
    return 'Premium'
  }

  return 'Luxury'
}

function priceBucketOptional(
  value: number | undefined,
  thresholds: { budget: number; midrange: number; premium: number },
): PriceCategory | undefined {
  if (value === undefined) {
    return undefined
  }

  return priceBucket(value, thresholds)
}

export function computeScores<T extends ResortInput>(resorts: T[]): ScoreResult<T> {
  const pisteBoundary = minMax(definedNumbers(resorts.map((resort) => resort.piste_km)))
  const skiPriceBoundary = minMax(
    definedNumbers(resorts.map((resort) => resort.lift_pass_day_eur)),
  )
  const tripBoundary = minMax(
    definedNumbers(resorts.map((resort) => resort.estimated_trip_cost_3_days_eur)),
  )

  const scored = resorts.map((resort) => {
    const practicalSizeValue =
      (resort.piste_km ?? 0) +
      (resort.vertical_drop_m ?? 0) / 100 +
      (resort.lift_count ?? 0)

    const sizeScore = normalize(resort.piste_km, pisteBoundary)
    const valueScore =
      normalize(resort.lift_pass_day_eur, skiPriceBoundary, true) * 0.5 +
      normalize(resort.estimated_trip_cost_3_days_eur, tripBoundary, true) * 0.5
    const snowScore = resort.snow_reliability_proxy ?? 0
    const accessScore = 1 - (resort.transfer_complexity ?? 1)

    return {
      ...resort,
      size_category_official: sizeBucket(resort.piste_km ?? 0, sizeThresholds.official),
      size_category_practical: sizeBucket(practicalSizeValue, sizeThresholds.practical),
      price_category_ski_only: priceBucketOptional(resort.lift_pass_day_eur, skiOnlyPriceThresholds),
      price_category_trip_cost: priceBucketOptional(resort.estimated_trip_cost_3_days_eur, tripPriceThresholds),
      size_score: sizeScore,
      value_score: valueScore,
      snow_score: snowScore,
      access_score: accessScore,
      overall_score:
        sizeScore * scoreWeights.size +
        valueScore * scoreWeights.value +
        snowScore * scoreWeights.snow +
        accessScore * scoreWeights.access,
    }
  })

  return {
    resorts: scored,
    boundaries: {
      piste_km: pisteBoundary,
      lift_pass_day_eur: skiPriceBoundary,
      estimated_trip_cost_3_days_eur: tripBoundary,
    },
  }
}
```

- [ ] **Step 4: Rewrite research/reports/buildChangeReport.ts**

```ts
// research/reports/buildChangeReport.ts
export type ChangeRecord = { id: string } & Record<string, unknown>

type Change = {
  id: string
  fields: string[]
}

type ChangeReport = {
  json: { changes: Change[] }
  markdown: string
}

function valueChanged(previous: unknown, next: unknown): boolean {
  return JSON.stringify(previous) !== JSON.stringify(next)
}

export function buildChangeReport(
  previous: ChangeRecord[],
  next: ChangeRecord[],
): ChangeReport {
  const previousById = new Map(previous.map((record) => [record.id, record]))
  const nextIds = new Set(next.map((record) => record.id))

  const changes = next.flatMap((record) => {
    const prior = previousById.get(record.id)

    if (prior === undefined) {
      return [{ id: record.id, fields: ['created'] }]
    }

    const fieldNames = new Set([
      ...Object.keys(prior).filter((key) => key !== 'id'),
      ...Object.keys(record).filter((key) => key !== 'id'),
    ])
    const fields = [...fieldNames].filter((key) =>
      valueChanged(prior[key], record[key]),
    )

    return fields.length > 0 ? [{ id: record.id, fields }] : []
  })

  const removals = previous
    .filter((record) => !nextIds.has(record.id))
    .map((record) => ({ id: record.id, fields: ['removed'] }))

  const allChanges = [...changes, ...removals]

  return {
    json: { changes: allChanges },
    markdown: allChanges.map((change) => `- ${change.id}: ${change.fields.join(', ')}`).join('\n'),
  }
}
```

- [ ] **Step 5: Rewrite research/validate/validatePublishedDataset.ts**

```ts
// research/validate/validatePublishedDataset.ts
import type { z } from 'zod'
import { publishedDatasetSchema } from '../schema'

type PublishedDataset = z.infer<typeof publishedDatasetSchema>

export function validatePublishedDataset(input: unknown): PublishedDataset {
  const dataset = publishedDatasetSchema.parse(input)

  for (const resort of dataset.resorts) {
    const requiredSources = [
      ['piste_km', resort.piste_km],
      ['lift_pass_day_eur', resort.lift_pass_day_eur],
      ['estimated_trip_cost_3_days_eur', resort.estimated_trip_cost_3_days_eur],
    ] as const

    for (const [field, value] of requiredSources) {
      if (value !== undefined && resort.field_sources[field] === undefined) {
        throw new Error(`Missing field source for published field: ${field}`)
      }
    }

    const hasDerivedInputs =
      resort.piste_km !== undefined || resort.lift_pass_day_eur !== undefined

    if (hasDerivedInputs) {
      const derivedFields = [
        resort.size_category_official,
        resort.price_category_ski_only,
        resort.overall_score,
      ]

      if (derivedFields.some((value) => value === undefined)) {
        throw new Error(`Missing derived published fields for resort: ${resort.id}`)
      }
    }
  }

  return dataset
}
```

- [ ] **Step 6: Rewrite research/publish/publishDataset.ts**

```ts
// research/publish/publishDataset.ts
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { validatePublishedDataset } from '../validate/validatePublishedDataset'

export function buildVersionId(date: Date): string {
  return date.toISOString().replace(/:/g, '-').replace(/\.\d{3}Z$/, 'Z')
}

export async function publishDataset(dataset: unknown, rootDir: string): Promise<void> {
  const validated = validatePublishedDataset(dataset)
  const datasetPath = path.join(
    rootDir,
    'data/published/versions',
    validated.version,
    'dataset.json',
  )
  const manifestPath = path.join(rootDir, 'data/published/manifest.json')
  const currentDatasetPath = path.join(rootDir, 'data/published/current.json')
  const serialized = JSON.stringify(validated, null, 2)

  await mkdir(path.dirname(datasetPath), { recursive: true })
  await writeFile(datasetPath, serialized)
  await writeFile(currentDatasetPath, serialized)
  await writeFile(
    manifestPath,
    JSON.stringify(
      {
        currentVersion: validated.version,
        currentPath: '/data/published/current.json',
      },
      null,
      2,
    ),
  )
}
```

- [ ] **Step 7: Rewrite research/cli.ts**

Key changes: remove `async` from `runCli` (it never awaits); return `Promise.resolve`/`Promise.reject` instead; add `void` to the floating promise in the entry point block; add explicit return types.

```ts
// research/cli.ts
declare const process:
  | {
      argv: string[]
    }
  | undefined

export interface Command {
  action: string
  scope: CommandScope
}

export type CommandScope = string

export function parseCommand(args: string[]): Command {
  const [action = '', scope = 'all'] = args

  return {
    action,
    scope,
  }
}

export function runCli(args: string[]): Promise<{ ok: true; action: string; scope: CommandScope }> {
  const command = parseCommand(args)

  if (command.action === 'refresh') {
    return Promise.resolve({ ok: true, ...command })
  }

  if (command.action === 'publish') {
    return Promise.resolve({ ok: true, ...command })
  }

  return Promise.reject(new Error(`Unknown command: ${command.action}`))
}

if (process !== undefined && import.meta.url === `file://${process.argv[1]}`) {
  void runCli(process.argv.slice(2)).then((result) => {
    console.log(JSON.stringify(result))
  })
}
```

- [ ] **Step 8: Fix research/sources/sourceRegistry.ts**

```ts
// research/sources/sourceRegistry.ts
export const sourceRegistry: Record<string, number> = {
  official: 1,
  tourism: 2,
  trusted_secondary: 3,
}
```

- [ ] **Step 9: Fix research/targets.ts**

```ts
// research/targets.ts
type ResortTarget = {
  id: string
  name: string
  country: string
  region: string
  source_urls: string[]
}

export const starterTargets: ResortTarget[] = [
  {
    id: 'three-valleys',
    name: 'Les 3 Vallees',
    country: 'France',
    region: 'Savoie',
    source_urls: ['https://www.les3vallees.com/en/'],
  },
  {
    id: 'st-anton',
    name: 'St Anton am Arlberg',
    country: 'Austria',
    region: 'Tyrol',
    source_urls: ['https://www.skiarlberg.at/en/'],
  },
]
```

- [ ] **Step 10: Run lint on research/ and fix any remaining violations**

```bash
npm run lint -- research/ 2>&1
```

Expected: 0 errors. If any remain, fix them before continuing — do not add `// eslint-disable` comments.

- [ ] **Step 11: Run tests to confirm nothing is broken**

```bash
npm test
```

Expected: all current project test files pass. Do not rely on a hardcoded count here because later tasks add new tests.

- [ ] **Step 12: Commit**

```bash
git add research/
git commit -m "fix: resolve all lint violations in research files"
```

---

### Task 5: Fix Lint Violations In Src Files

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/Hero.tsx`
- Modify: `src/components/FilterBar.tsx`
- Modify: `src/components/ComparePanel.tsx`
- Modify: `src/components/ResortGrid.tsx`
- Modify: `src/components/ResortCard.tsx`
- Modify: `src/components/ResortDetailDrawer.tsx`
- Modify: `src/data/loadPublishedDataset.ts`
- Modify: `src/lib/queryState.ts`
- Modify: `src/lib/format.ts`

- [ ] **Step 1: Run lint on src/ to see all violations**

```bash
npm run lint -- src/ 2>&1
```

Expected: violations across multiple files. The steps below fix them all.

- [ ] **Step 2: Rewrite src/App.tsx**

Key changes: explicit return type; `void` on the floating `.then()`; `normalizedSearch.length === 0` instead of `!normalizedSearch`.

```tsx
// src/App.tsx
import { useEffect, useMemo, useState } from 'react'
import type { JSX } from 'react'
import Hero from './components/Hero'
import FilterBar from './components/FilterBar'
import ComparePanel from './components/ComparePanel'
import ResortGrid from './components/ResortGrid'
import { loadPublishedDataset } from './data/loadPublishedDataset'
import type { PublishedResort } from './data/loadPublishedDataset'
import { parseCompareIds } from './lib/queryState'
import './styles/tokens.css'
import './styles/global.css'

export default function App(): JSX.Element {
  const [search, setSearch] = useState('')
  const [resorts, setResorts] = useState<PublishedResort[]>([])

  useEffect(() => {
    let isActive = true

    void loadPublishedDataset().then((dataset) => {
      if (!isActive) {
        return
      }

      setResorts(dataset.resorts)
    })

    return () => {
      isActive = false
    }
  }, [])

  const compareIds = useMemo(
    () => parseCompareIds(window.location.search),
    [],
  )

  const filteredResorts = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()

    if (normalizedSearch.length === 0) {
      return resorts
    }

    return resorts.filter((resort) =>
      [resort.name, resort.country, resort.region]
        .join(' ')
        .toLowerCase()
        .includes(normalizedSearch),
    )
  }, [resorts, search])

  const comparedResorts = useMemo(
    () => resorts.filter((resort) => compareIds.includes(resort.id)),
    [compareIds, resorts],
  )

  return (
    <main className="app-shell">
      <Hero />
      <FilterBar search={search} onSearchChange={setSearch} />
      <ComparePanel resorts={comparedResorts} />
      <ResortGrid resorts={filteredResorts} />
    </main>
  )
}
```

- [ ] **Step 3: Fix src/components/Hero.tsx**

```tsx
// src/components/Hero.tsx
import type { JSX } from 'react'

export default function Hero(): JSX.Element {
  return (
    <section className="hero" aria-label="Snowboard Trip Advisor introduction">
      <p className="eyebrow">Europe resort research</p>
      <h1>Snowboard Trip Advisor</h1>
      <p className="hero-copy">
        Best ski resorts in Europe, ranked by objective metrics and published
        data.
      </p>
      <ul className="hero-points" aria-label="Key features">
        <li>Compare size, price, and snow reliability.</li>
        <li>Filter the published dataset without live scraping.</li>
        <li>Keep shortlist state in the URL for sharing.</li>
      </ul>
    </section>
  )
}
```

- [ ] **Step 4: Fix src/components/FilterBar.tsx**

```tsx
// src/components/FilterBar.tsx
import type { JSX } from 'react'

type Props = {
  search: string
  onSearchChange: (value: string) => void
}

export default function FilterBar({ search, onSearchChange }: Props): JSX.Element {
  return (
    <label className="filter-bar">
      <span>Search resorts</span>
      <input
        type="search"
        aria-label="Search resorts"
        placeholder="Verbier, St Anton, Les 3 Vallees"
        value={search}
        onChange={(event) => { onSearchChange(event.target.value) }}
      />
    </label>
  )
}
```

- [ ] **Step 5: Fix src/components/ComparePanel.tsx**

```tsx
// src/components/ComparePanel.tsx
import type { JSX } from 'react'

type CompareResort = {
  id: string
  name: string
}

type Props = {
  resorts: CompareResort[]
}

export default function ComparePanel({ resorts }: Props): JSX.Element {
  return (
    <section className="compare-panel" aria-label="Compare resorts">
      <header className="compare-panel__header">
        <h2>Compare resorts</h2>
        <p>Compare up to four resorts and keep the selection in the URL.</p>
      </header>

      {resorts.length > 0 ? (
        <ol className="compare-panel__list">
          {resorts.map((resort) => (
            <li key={resort.id} data-resort-id={resort.id}>
              {resort.name}
            </li>
          ))}
        </ol>
      ) : (
        <p className="compare-panel__empty">
          Select resorts to compare their size, price, and snow metrics.
        </p>
      )}
    </section>
  )
}
```

- [ ] **Step 6: Fix src/components/ResortGrid.tsx**

```tsx
// src/components/ResortGrid.tsx
import type { JSX } from 'react'
import type { PublishedResort } from '../data/loadPublishedDataset'
import ResortCard from './ResortCard'

type Props = {
  resorts: PublishedResort[]
}

export default function ResortGrid({ resorts }: Props): JSX.Element {
  if (resorts.length === 0) {
    return (
      <section className="resort-grid resort-grid--empty" aria-label="Resort results">
        <p>No resorts match the current filters.</p>
      </section>
    )
  }

  return (
    <section className="resort-grid" aria-label="Resort results">
      <ul className="resort-grid__list">
        {resorts.map((resort) => (
          <li key={resort.id}>
            <ResortCard resort={resort} />
          </li>
        ))}
      </ul>
    </section>
  )
}
```

- [ ] **Step 7: Fix src/components/ResortCard.tsx**

```tsx
// src/components/ResortCard.tsx
import type { JSX } from 'react'
import type { PublishedResort } from '../data/loadPublishedDataset'
import { formatConfidence, formatEuro, formatInteger } from '../lib/format'

type Props = {
  resort: PublishedResort
}

export default function ResortCard({ resort }: Props): JSX.Element {
  return (
    <article className="resort-card" data-resort-id={resort.id}>
      <header className="resort-card__header">
        <div>
          <p className="resort-card__eyebrow">
            {resort.country} · {resort.region}
          </p>
          <h3>{resort.name}</h3>
        </div>
        <span className="resort-card__status">{resort.status}</span>
      </header>

      <dl className="resort-card__stats">
        <div>
          <dt>Piste km</dt>
          <dd>{formatInteger(resort.piste_km)}</dd>
        </div>
        <div>
          <dt>Day pass</dt>
          <dd>{formatEuro(resort.lift_pass_day_eur)}</dd>
        </div>
        <div>
          <dt>3-day trip</dt>
          <dd>{formatEuro(resort.estimated_trip_cost_3_days_eur)}</dd>
        </div>
        <div>
          <dt>Confidence</dt>
          <dd>{formatConfidence(resort.overall_confidence)}</dd>
        </div>
      </dl>

      <footer className="resort-card__footer">
        <span>{resort.size_category_official ?? 'Size unclassified'}</span>
        <span>{resort.price_category_ski_only ?? 'Price unclassified'}</span>
      </footer>
    </article>
  )
}
```

- [ ] **Step 8: Fix src/components/ResortDetailDrawer.tsx**

```tsx
// src/components/ResortDetailDrawer.tsx
import type { JSX } from 'react'

type Resort = {
  id: string
  name: string
}

type Props = {
  resort: Resort | null
}

export default function ResortDetailDrawer({ resort }: Props): JSX.Element | null {
  if (resort === null) {
    return null
  }

  return (
    <aside aria-label="Resort details">
      <h3>{resort.name}</h3>
    </aside>
  )
}
```

- [ ] **Step 9: Fix src/data/loadPublishedDataset.ts**

```ts
// src/data/loadPublishedDataset.ts
import type { z } from 'zod'
import { publishedDatasetSchema } from '../../research/schema'

export type PublishedDataset = z.infer<typeof publishedDatasetSchema>
export type PublishedResort = PublishedDataset['resorts'][number]

export async function loadPublishedDataset(): Promise<PublishedDataset> {
  const response = await fetch('/data/published/current.json')

  if (!response.ok) {
    throw new Error(`Failed to load published dataset: ${response.status}`)
  }

  return publishedDatasetSchema.parse(await response.json()) as PublishedDataset
}
```

- [ ] **Step 10: Fix src/lib/queryState.ts**

```ts
// src/lib/queryState.ts
const MAX_COMPARE_IDS = 4

function normalizeIds(ids: string[]): string[] {
  return Array.from(
    new Set(ids.map((id) => id.trim()).filter((id) => id.length > 0)),
  ).slice(0, MAX_COMPARE_IDS)
}

export function parseCompareIds(search: string): string[] {
  const params = new URLSearchParams(search)
  const values = params
    .getAll('compare')
    .flatMap((value) => value.split(','))

  return normalizeIds(values)
}

export function serializeCompareIds(ids: string[]): string {
  const normalizedIds = normalizeIds(ids)

  return normalizedIds.length > 0 ? `?compare=${normalizedIds.join(',')}` : ''
}
```

- [ ] **Step 11: Fix src/lib/format.ts**

```ts
// src/lib/format.ts
function createFormatter(options: Intl.NumberFormatOptions): Intl.NumberFormat {
  return new Intl.NumberFormat('en-IE', options)
}

export function formatEuro(value: number | null | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '—'
  }

  return createFormatter({
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatInteger(value: number | null | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '—'
  }

  return createFormatter({ maximumFractionDigits: 0 }).format(value)
}

export function formatPercent(value: number | null | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '—'
  }

  return createFormatter({
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatConfidence(value: number | null | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 'Unknown confidence'
  }

  if (value >= 0.8) {
    return 'High confidence'
  }

  if (value >= 0.5) {
    return 'Medium confidence'
  }

  return 'Low confidence'
}
```

- [ ] **Step 12: Run lint on src/ and fix any remaining violations**

```bash
npm run lint -- src/ 2>&1
```

Expected: 0 errors. If any remain, fix them — do not add `// eslint-disable` comments.

- [ ] **Step 13: Run full lint to confirm both src/ and research/ are clean**

```bash
npm run lint 2>&1
```

Expected: 0 errors, 0 warnings.

- [ ] **Step 14: Run tests to confirm nothing is broken**

```bash
npm test
```

Expected: all 9 test files pass.

- [ ] **Step 15: Commit**

```bash
git add src/
git commit -m "fix: resolve all lint violations in src files"
```

---

### Task 6: Write Missing Tests For Src Coverage Gaps

**Files:**
- Create: `src/lib/format.test.ts`
- Create: `src/components/Hero.test.tsx`
- Create: `src/components/ResortCard.test.tsx`
- Create: `src/components/ResortGrid.test.tsx`
- Create: `src/components/ResortDetailDrawer.test.tsx`
- Modify: `src/components/ComparePanel.test.tsx`
- Modify: `src/data/loadPublishedDataset.test.ts`
- Modify: `src/lib/queryState.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/format.test.ts
import { describe, expect, it } from 'vitest'
import {
  formatConfidence,
  formatEuro,
  formatInteger,
  formatPercent,
} from './format'

describe('formatEuro', () => {
  it('formats a valid euro amount', () => {
    expect(formatEuro(79)).toContain('79')
  })

  it('returns an em dash for undefined', () => {
    expect(formatEuro(undefined)).toBe('—')
  })

  it('returns an em dash for null', () => {
    expect(formatEuro(null)).toBe('—')
  })

  it('returns an em dash for NaN', () => {
    expect(formatEuro(NaN)).toBe('—')
  })
})

describe('formatInteger', () => {
  it('formats a valid integer', () => {
    expect(formatInteger(600)).toContain('600')
  })

  it('returns an em dash for undefined', () => {
    expect(formatInteger(undefined)).toBe('—')
  })

  it('returns an em dash for null', () => {
    expect(formatInteger(null)).toBe('—')
  })

  it('returns an em dash for NaN', () => {
    expect(formatInteger(NaN)).toBe('—')
  })
})

describe('formatPercent', () => {
  it('formats a valid percentage', () => {
    expect(formatPercent(0.75)).toContain('75')
  })

  it('returns an em dash for undefined', () => {
    expect(formatPercent(undefined)).toBe('—')
  })

  it('returns an em dash for null', () => {
    expect(formatPercent(null)).toBe('—')
  })

  it('returns an em dash for NaN', () => {
    expect(formatPercent(NaN)).toBe('—')
  })
})

describe('formatConfidence', () => {
  it('returns High confidence for values >= 0.8', () => {
    expect(formatConfidence(0.8)).toBe('High confidence')
    expect(formatConfidence(1.0)).toBe('High confidence')
  })

  it('returns Medium confidence for values >= 0.5 and < 0.8', () => {
    expect(formatConfidence(0.5)).toBe('Medium confidence')
    expect(formatConfidence(0.79)).toBe('Medium confidence')
  })

  it('returns Low confidence for values < 0.5', () => {
    expect(formatConfidence(0.0)).toBe('Low confidence')
    expect(formatConfidence(0.49)).toBe('Low confidence')
  })

  it('returns Unknown confidence for undefined', () => {
    expect(formatConfidence(undefined)).toBe('Unknown confidence')
  })

  it('returns Unknown confidence for null', () => {
    expect(formatConfidence(null)).toBe('Unknown confidence')
  })

  it('returns Unknown confidence for NaN', () => {
    expect(formatConfidence(NaN)).toBe('Unknown confidence')
  })
})
```

```tsx
// src/components/Hero.test.tsx
import { render, screen } from '@testing-library/react'
import Hero from './Hero'

it('renders the app headline and feature list', () => {
  render(<Hero />)

  expect(screen.getByRole('heading', { name: 'Snowboard Trip Advisor' })).toBeInTheDocument()
  expect(screen.getByText(/best ski resorts in europe/i)).toBeInTheDocument()
  expect(screen.getByText('Compare size, price, and snow reliability.')).toBeInTheDocument()
})
```

```tsx
// src/components/ResortCard.test.tsx
import { render, screen } from '@testing-library/react'
import ResortCard from './ResortCard'

const baseResort = {
  id: 'verbier',
  name: 'Verbier',
  country: 'Switzerland',
  region: 'Valais',
  status: 'active' as const,
  overall_confidence: 0.9,
  source_urls: ['https://www.verbier.ch/'],
  field_sources: {},
  piste_km: 410,
  lift_pass_day_eur: 79,
  estimated_trip_cost_3_days_eur: 880,
  size_category_official: 'Mega' as const,
  price_category_ski_only: 'Premium' as const,
  overall_score: 0.82,
}

it('renders resort name, location and key metrics', () => {
  render(<ResortCard resort={baseResort} />)

  expect(screen.getByText('Verbier')).toBeInTheDocument()
  expect(screen.getByText('Switzerland · Valais')).toBeInTheDocument()
  expect(screen.getByText('Mega')).toBeInTheDocument()
  expect(screen.getByText('Premium')).toBeInTheDocument()
  expect(screen.getByText('High confidence')).toBeInTheDocument()
})

it('shows em dash for missing numeric fields', () => {
  render(<ResortCard resort={{ ...baseResort, piste_km: undefined }} />)

  const dashes = screen.getAllByText('—')
  expect(dashes.length).toBeGreaterThan(0)
})

it('shows unclassified labels when categories are missing', () => {
  render(
    <ResortCard
      resort={{
        ...baseResort,
        size_category_official: undefined,
        price_category_ski_only: undefined,
      }}
    />,
  )

  expect(screen.getByText('Size unclassified')).toBeInTheDocument()
  expect(screen.getByText('Price unclassified')).toBeInTheDocument()
})
```

```tsx
// src/components/ResortGrid.test.tsx
import { render, screen } from '@testing-library/react'
import ResortGrid from './ResortGrid'

const resort = {
  id: 'verbier',
  name: 'Verbier',
  country: 'Switzerland',
  region: 'Valais',
  status: 'active' as const,
  overall_confidence: 0.9,
  source_urls: [],
  field_sources: {},
}

it('renders a resort card for each resort', () => {
  render(
    <ResortGrid
      resorts={[
        resort,
        { ...resort, id: 'st-anton', name: 'St Anton am Arlberg' },
      ]}
    />,
  )

  expect(screen.getByText('Verbier')).toBeInTheDocument()
  expect(screen.getByText('St Anton am Arlberg')).toBeInTheDocument()
})

it('renders the empty state when the resort list is empty', () => {
  render(<ResortGrid resorts={[]} />)

  expect(screen.getByText('No resorts match the current filters.')).toBeInTheDocument()
})
```

```tsx
// src/components/ResortDetailDrawer.test.tsx
import { render, screen } from '@testing-library/react'
import ResortDetailDrawer from './ResortDetailDrawer'

it('renders nothing when resort is null', () => {
  const { container } = render(<ResortDetailDrawer resort={null} />)

  expect(container).toBeEmptyDOMElement()
})

it('renders resort name when a resort is provided', () => {
  render(<ResortDetailDrawer resort={{ id: 'verbier', name: 'Verbier' }} />)

  expect(screen.getByRole('heading', { name: 'Verbier' })).toBeInTheDocument()
})
```

Add the empty-state test to ComparePanel.test.tsx:

```tsx
// src/components/ComparePanel.test.tsx — add this test alongside the existing one
it('renders the empty guidance when no resorts are selected', () => {
  render(<ComparePanel resorts={[]} />)

  expect(
    screen.getByText('Select resorts to compare their size, price, and snow metrics.'),
  ).toBeInTheDocument()
})
```

Add the error branch test to loadPublishedDataset.test.ts:

```ts
// src/data/loadPublishedDataset.test.ts — add this test inside the describe block
it('throws when the response is not ok', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    }),
  )

  await expect(loadPublishedDataset()).rejects.toThrow(
    'Failed to load published dataset: 404',
  )
})
```

Add empty-input branches to queryState.test.ts:

```ts
// src/lib/queryState.test.ts — add these tests inside the describe block
it('returns empty array when no compare param is present', () => {
  expect(parseCompareIds('')).toEqual([])
  expect(parseCompareIds('?other=value')).toEqual([])
})

it('returns empty string when ids array is empty', () => {
  expect(serializeCompareIds([])).toBe('')
})

it('deduplicates ids and caps at four', () => {
  expect(
    parseCompareIds('?compare=a,b,a,c,d,e'),
  ).toEqual(['a', 'b', 'c', 'd'])
})
```

- [ ] **Step 2: Run the new tests to verify they fail**

```bash
npm test -- --run src/lib/format.test.ts src/components/Hero.test.tsx src/components/ResortCard.test.tsx src/components/ResortGrid.test.tsx src/components/ResortDetailDrawer.test.tsx 2>&1
```

Expected: FAIL — these files don't exist yet.

- [ ] **Step 3: The tests reference existing implementations — run them to confirm they pass**

The implementations already exist. The tests just need to be created (done in Step 1). Run all src tests:

```bash
npm test -- --run src/ 2>&1
```

Expected: all `src/` tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/format.test.ts src/components/Hero.test.tsx src/components/ResortCard.test.tsx src/components/ResortGrid.test.tsx src/components/ResortDetailDrawer.test.tsx src/components/ComparePanel.test.tsx src/data/loadPublishedDataset.test.ts src/lib/queryState.test.ts
git commit -m "test: add missing src coverage tests for 100% gate"
```

---

### Task 7: Write Missing Tests For Research Coverage Gaps

**Files:**
- Create: `research/validate/validatePublishedDataset.test.ts`
- Modify: `research/reports/buildChangeReport.test.ts`
- Modify: `research/schema.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// research/validate/validatePublishedDataset.test.ts
import { describe, expect, it } from 'vitest'
import { validatePublishedDataset } from './validatePublishedDataset'

const validDataset = {
  version: '2026-04-03T01-45-00Z',
  generated_at: '2026-04-03T01:45:00Z',
  scoring: {
    normalization: 'min-max',
    boundaries: {
      piste_km: { min: 70, max: 600 },
      lift_pass_day_eur: { min: 40, max: 79 },
    },
  },
  resorts: [],
}

const validResort = {
  id: 'verbier',
  name: 'Verbier',
  country: 'Switzerland',
  region: 'Valais',
  status: 'active',
  overall_confidence: 0.9,
  source_urls: ['https://www.verbier.ch/'],
  field_sources: {
    piste_km: {
      source: 'https://www.verbier.ch/',
      retrieved_at: '2026-04-03T01:45:00Z',
      confidence: 0.9,
    },
    lift_pass_day_eur: {
      source: 'https://www.verbier.ch/',
      retrieved_at: '2026-04-03T01:45:00Z',
      confidence: 0.9,
    },
  },
  piste_km: 410,
  lift_pass_day_eur: 79,
  size_category_official: 'Mega',
  price_category_ski_only: 'Premium',
  overall_score: 0.82,
}

describe('validatePublishedDataset', () => {
  it('accepts a valid dataset with no resorts', () => {
    expect(() => validatePublishedDataset(validDataset)).not.toThrow()
  })

  it('accepts a valid dataset with a fully sourced resort', () => {
    expect(() =>
      validatePublishedDataset({ ...validDataset, resorts: [validResort] }),
    ).not.toThrow()
  })

  it('throws when a resort has a metric value but no field source', () => {
    const resort = {
      ...validResort,
      field_sources: {
        lift_pass_day_eur: validResort.field_sources.lift_pass_day_eur,
      },
    }

    expect(() =>
      validatePublishedDataset({ ...validDataset, resorts: [resort] }),
    ).toThrow('Missing field source for published field: piste_km')
  })

  it('throws when derived fields are missing for a resort with inputs', () => {
    const resort = {
      ...validResort,
      size_category_official: undefined,
      price_category_ski_only: undefined,
      overall_score: undefined,
    }

    expect(() =>
      validatePublishedDataset({ ...validDataset, resorts: [resort] }),
    ).toThrow('Missing derived published fields for resort: verbier')
  })

  it('throws on invalid schema input', () => {
    expect(() => validatePublishedDataset(null)).toThrow()
  })
})
```

Add the created-record test to buildChangeReport.test.ts:

```ts
// research/reports/buildChangeReport.test.ts — add this test inside the describe block
it('reports resorts present in next but not in previous as created', () => {
  const report = buildChangeReport(
    [{ id: 'a', lift_pass_day_eur: 40 }],
    [
      { id: 'a', lift_pass_day_eur: 40 },
      { id: 'b', lift_pass_day_eur: 80 },
    ],
  )

  expect(report.json.changes).toEqual([{ id: 'b', fields: ['created'] }])
  expect(report.markdown).toContain('b: created')
})
```

Add sourceRegistry and targets coverage to schema.test.ts:

```ts
// research/schema.test.ts — add these tests at the bottom of the file
import { sourceRegistry } from './sources/sourceRegistry'
import { starterTargets } from './targets'

describe('sourceRegistry', () => {
  it('exports priority tiers as numeric values', () => {
    expect(sourceRegistry['official']).toBe(1)
    expect(sourceRegistry['tourism']).toBe(2)
    expect(sourceRegistry['trusted_secondary']).toBe(3)
  })
})

describe('starterTargets', () => {
  it('seeds the initial target manifest', () => {
    expect(starterTargets).toHaveLength(2)
    expect(starterTargets[0].id).toBe('three-valleys')
    expect(starterTargets[1].id).toBe('st-anton')
  })
})
```

- [ ] **Step 2: Run the new tests to verify they pass**

```bash
npm test -- --run research/validate/validatePublishedDataset.test.ts research/reports/buildChangeReport.test.ts research/schema.test.ts 2>&1
```

Expected: all tests pass. The implementations already exist.

- [ ] **Step 3: Commit**

```bash
git add research/validate/validatePublishedDataset.test.ts research/reports/buildChangeReport.test.ts research/schema.test.ts
git commit -m "test: add missing research coverage tests for 100% gate"
```

---

### Task 8: Write CLAUDE.md

**Files:**
- Create: `CLAUDE.md`

- [ ] **Step 1: Write CLAUDE.md**

```markdown
# CLAUDE.md

Instructions for agents working on the Snowboard Trip Advisor project.

---

## Setup

Run once after cloning:

```bash
npm install
npm run setup
```

`npm run setup` installs the pre-commit hook from `scripts/pre-commit` into `.git/hooks/`. The hook runs the full quality gate on every commit.

---

## Quality Gate

The quality gate is a hard requirement. A task is not done until `npm run qa` passes cleanly.

```bash
npm run qa
```

This runs in sequence and fails fast:

1. `npm run lint` — ESLint strict type-aware rules
2. `npm run typecheck` — TypeScript with `strict: true` and `noEmit`
3. `npm run coverage` — Vitest with 100% thresholds on lines, branches, functions, and statements

**Rules:**

- Run `npm run qa` before claiming any task complete.
- Run `npm run qa` before every commit. The pre-commit hook enforces this automatically.
- Never use `git commit --no-verify`. This is prohibited without exception.
- A passing `npm run qa` is the definition of done. Partial coverage and lint warnings are not acceptable.

---

## TDD Workflow

Every code change follows this order:

1. Write a failing test that describes the intended behavior.
2. Run the specific test file and confirm it fails for the right reason.
3. Write the minimal implementation to make the test pass.
4. Run the specific test file and confirm it passes.
5. Run `npm run qa` and confirm the full gate is clean.

No implementation code is written without a failing test first.

---

## Code Rules

These rules are enforced by ESLint. Understanding them prevents wasted cycles.

**TypeScript:**
- All functions require explicit return types. Inferred return types are not permitted on exported functions or any function declaration.
- Use `import type` for any import that is used only as a type.
- No `any` type. Use `unknown` and narrow it explicitly.
- No non-null assertions (`!`). Handle the null or undefined case explicitly.
- No unhandled promises. Every `async` call must be awaited or marked `void` when intentionally fire-and-forget.
- Use `const` unless reassignment is required.
- Prefer `??` over `||` for nullish coalescing.
- Prefer optional chaining (`?.`) over chained `&&` guards.

**Style:**
- No `console` outside `research/cli.ts`.
- No nested ternaries.
- Always use braces on conditionals, even for one-liners.
- Use object shorthand (`{ foo }` not `{ foo: foo }`).
- No `else` after a `return`.
- Always use `===`, never `==`.
- No `var`. Use `const` or `let`.

**React:**
- All React components must have explicit `JSX.Element` or `JSX.Element | null` return types.
- Import the JSX type: `import type { JSX } from 'react'`.
- Follow the rules of hooks. `exhaustive-deps` violations are errors, not warnings.

---

## Research Pipeline Rules

- **Schema first.** If a field is added to the data model, update `research/schema.ts` before any normalizer, scorer, or publisher.
- **Never bypass validation.** The published dataset must pass `validatePublishedDataset` before `publishDataset` is called.
- **Config, not code.** Scoring thresholds and weights live in `config/scoring.ts`. They must not be hardcoded in normalizers or scorers.
- **Provenance always.** Every metric field in a published resort must have a matching entry in `field_sources`.

---

## Coverage Rules

- 100% coverage on lines, branches, functions, and statements is a hard gate enforced by Vitest thresholds.
- If a line of code cannot be tested, the design is wrong — restructure rather than suppress.
- Coverage exclusions are declared in `vite.config.ts` with a written rationale. No `/* istanbul ignore */` comments are permitted anywhere.
- New files added to `src/` or `research/` are automatically in scope. Adding a coverage exclusion requires an explicit config change and justification.

---

## Excluded From Coverage (and why)

- `src/main.tsx` — React DOM entry point, not unit-testable
- `src/test/**` — test setup files
- `research/sources/fetchText.ts` — pure network I/O, no mockable unit seam
- `config/scoring.ts` — exported constants with no branching logic
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add CLAUDE.md with quality gate and agent instructions"
```

---

### Task 9: Final Verification, Push

**Files:** none

- [ ] **Step 1: Run the full quality gate**

```bash
npm run qa 2>&1
```

Expected:
- `eslint .` — exits 0 with no errors or warnings
- `tsc --noEmit` — exits 0
- `vitest run --coverage` — all tests pass, all four coverage thresholds at 100%, gate exits 0

If any step fails, diagnose and fix before continuing. Do not proceed with a failing gate.

- [ ] **Step 2: Verify the pre-commit hook file is installed**

```bash
ls -la .git/hooks/pre-commit
```

Expected: the hook exists and is executable. Do not create a dummy commit-and-revert cycle on `main` just to test the hook.

- [ ] **Step 3: Push to origin**

```bash
git push origin main
```

Expected: push succeeds with all commits including CLAUDE.md, qa tooling, lint fixes, and coverage tests.

---

## Self-Review

### Spec Coverage

- Install new dev dependencies: Task 1
- `eslint.config.js` with strict type-aware rules: Task 2
- `vite.config.ts` with coverage thresholds and worktree exclusion: Task 2
- `scripts/pre-commit` and `npm run setup`: Task 3
- Fix all lint violations in research/: Task 4
- Fix all lint violations in src/: Task 5
- 100% coverage for src/ gaps: Task 6
- 100% coverage for research/ gaps: Task 7
- `CLAUDE.md`: Task 8
- Final `npm run qa` clean + push: Task 9

### Placeholder Scan

- All steps include exact commands, file paths, and complete code.
- No "TBD", "implement later", or "similar to above" in any step.
- Every predicted lint violation includes the specific fix with complete file content.
- Every coverage gap includes complete test code.

### Type Consistency

- `ChangeRecord` type defined in `buildChangeReport.ts` is `{ id: string } & Record<string, unknown>` — tests use `{ id: string, ... }` objects which satisfy this.
- `NormalizedResort` in `normalizeResort.ts` matches the fields produced by the function body.
- `ScoreResult<T>` and `ScoredFields` in `computeScores.ts` are consistent with what the function returns.
- `JSX.Element` return type in all React components — imported from `'react'` consistently.
- `validatePublishedDataset` return type is `PublishedDataset` (Zod inferred) — matches what `publishDataset.ts` receives.
