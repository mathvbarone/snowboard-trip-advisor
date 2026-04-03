# Snowboard Trip Advisor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone public-facing app that researches, publishes, and presents objective European ski resort comparisons by price and size.

**Architecture:** Use a single TypeScript project with a React/Vite frontend and a Node-based research CLI. The research side owns source fetching, normalization, scoring, versioned dataset publishing, and change reports; the frontend reads only the published dataset and preserves compare/filter state in the URL.

**Tech Stack:** TypeScript, React, Vite, Vitest, Testing Library, Node.js, Zod

---

## Planned File Structure

- `package.json` - scripts and dependencies
- `tsconfig.json` - shared TS config
- `vite.config.ts` - Vite + Vitest configuration
- `index.html` - app entry document
- `README.md` - setup, refresh, publish, and verification commands
- `config/scoring.ts` - category thresholds and scoring weights
- `src/main.tsx` - React bootstrap
- `src/App.tsx` - app composition
- `src/styles/tokens.css` - design tokens
- `src/styles/global.css` - app styling
- `src/data/loadPublishedDataset.ts` - published dataset loader
- `src/data/loadPublishedDataset.test.ts` - loader tests
- `src/lib/queryState.ts` - URL query parsing/serialization
- `src/lib/queryState.test.ts` - query-state tests
- `src/lib/format.ts` - formatting helpers
- `src/components/Hero.tsx` - page hero
- `src/components/FilterBar.tsx` - search/filter UI
- `src/components/FilterBar.test.tsx` - filter tests
- `src/components/ResortGrid.tsx` - resort collection rendering
- `src/components/ResortCard.tsx` - summary card
- `src/components/ComparePanel.tsx` - compare view
- `src/components/ComparePanel.test.tsx` - compare tests
- `src/components/ResortDetailDrawer.tsx` - detail presentation
- `src/App.test.tsx` - app integration tests
- `src/test/setup.ts` - test setup
- `research/schema.ts` - canonical schemas
- `research/schema.test.ts` - schema tests
- `research/targets.ts` - initial resort target manifest
- `research/__fixtures__/sampleResortSource.ts` - source fixture
- `research/sources/fetchText.ts` - fetch helper
- `research/sources/sourceRegistry.ts` - source registry
- `research/normalize/normalizeResort.ts` - normalization logic
- `research/normalize/normalizeResort.test.ts` - normalization tests
- `research/scoring/computeScores.ts` - scoring and categorization
- `research/scoring/computeScores.test.ts` - scoring tests
- `research/reports/buildChangeReport.ts` - ID-based change reports
- `research/reports/buildChangeReport.test.ts` - change-report tests
- `research/validate/validatePublishedDataset.ts` - publish validation
- `research/publish/publishDataset.ts` - versioned publish + manifest update
- `research/publish/publishDataset.test.ts` - publish tests
- `research/cli.ts` - CLI parsing and command dispatch
- `research/cli.test.ts` - CLI tests
- `data/raw/.gitkeep` - raw data directory
- `data/normalized/.gitkeep` - normalized data directory
- `data/published/manifest.json` - current version manifest
- `data/published/current.json` - current published dataset fixture for local dev

### Task 1: Scaffold The Project And Testable Frontend Tooling

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/App.test.tsx`
- Create: `src/test/setup.ts`
- Create: `src/styles/tokens.css`
- Create: `src/styles/global.css`

- [ ] **Step 1: Write the failing app smoke test**

```tsx
// src/App.test.tsx
import { render, screen } from '@testing-library/react'
import App from './App'

it('renders the snowboard trip advisor shell', () => {
  render(<App />)
  expect(screen.getByText('Snowboard Trip Advisor')).toBeInTheDocument()
  expect(
    screen.getByText('Best ski resorts in Europe, ranked by objective metrics'),
  ).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/App.test.tsx`
Expected: FAIL because the frontend scaffold and Vitest config do not exist yet.

- [ ] **Step 3: Write the minimal scaffold and config**

```json
// package.json
{
  "name": "snowboard-trip-advisor",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "research": "tsx research/cli.ts"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.0",
    "@testing-library/react": "^16.1.0",
    "@testing-library/user-event": "^14.5.2",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^5.0.0",
    "jsdom": "^25.0.1",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "vite": "^6.0.0",
    "vitest": "^2.1.0"
  }
}
```

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
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src", "research", "config", "vite.config.ts"]
}
```

```ts
// vite.config.ts
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    globals: true,
  },
})
```

```ts
// src/test/setup.ts
import '@testing-library/jest-dom'
```

```tsx
// src/App.tsx
import './styles/tokens.css'
import './styles/global.css'

export default function App() {
  return (
    <main className="app-shell">
      <section className="hero">
        <p className="eyebrow">Europe resort research</p>
        <h1>Snowboard Trip Advisor</h1>
        <p className="hero-copy">
          Best ski resorts in Europe, ranked by objective metrics
        </p>
      </section>
    </main>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/App.test.tsx`
Expected: PASS with `1 passed`.

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.json vite.config.ts index.html src/main.tsx src/App.tsx src/App.test.tsx src/test/setup.ts src/styles/tokens.css src/styles/global.css
git commit -m "feat: scaffold snowboard trip advisor frontend"
```

### Task 2: Define Config, Schemas, And Seed Targets

**Files:**
- Create: `config/scoring.ts`
- Create: `research/schema.ts`
- Create: `research/schema.test.ts`
- Create: `research/targets.ts`
- Create: `data/published/manifest.json`
- Create: `data/published/current.json`

- [ ] **Step 1: Write the failing schema tests**

```ts
// research/schema.test.ts
import { describe, expect, it } from 'vitest'
import { publishedDatasetSchema, resortRecordSchema } from './schema'

describe('publishedDatasetSchema', () => {
  it('requires min-max boundaries in scoring metadata', () => {
    const result = publishedDatasetSchema.safeParse({
      version: '2026-04-03T01-45-00Z',
      generated_at: '2026-04-03T01:45:00Z',
      scoring: {
        normalization: 'min-max',
        boundaries: {
          piste_km: { min: 50, max: 600 },
          lift_pass_day_eur: { min: 38, max: 92 }
        }
      },
      resorts: []
    })

    expect(result.success).toBe(true)
  })

  it('accepts numeric overall confidence and typed status', () => {
    const result = resortRecordSchema.safeParse({
      id: 'three-valleys',
      name: 'Les 3 Vallees',
      country: 'France',
      region: 'Savoie',
      status: 'active',
      overall_confidence: 0.84,
      source_urls: ['https://www.les3vallees.com/en/'],
      field_sources: {}
    })

    expect(result.success).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run research/schema.test.ts`
Expected: FAIL because `research/schema.ts` and `config/scoring.ts` do not exist.

- [ ] **Step 3: Write shared config, schema, and seed files**

```ts
// config/scoring.ts
export const sizeThresholds = {
  official: { medium: 80, large: 200, mega: 400 },
  practical: { medium: 110, large: 260, mega: 430 },
}

export const skiOnlyPriceThresholds = {
  budget: 45,
  midrange: 65,
  premium: 85,
}

export const tripPriceThresholds = {
  budget: 500,
  midrange: 900,
  premium: 1400,
}

export const scoreWeights = {
  size: 0.35,
  value: 0.3,
  snow: 0.2,
  access: 0.15,
}
```

```ts
// research/schema.ts
import { z } from 'zod'

export const statusSchema = z.enum([
  'active',
  'seasonal_unknown',
  'temporarily_unavailable',
  'closed',
])

export const boundarySchema = z.object({
  min: z.number(),
  max: z.number(),
})

export const fieldSourceSchema = z.object({
  source: z.string().url(),
  retrieved_at: z.string(),
  confidence: z.number().min(0).max(1),
  notes: z.string().optional(),
})

export const resortRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  country: z.string(),
  region: z.string(),
  status: statusSchema,
  overall_confidence: z.number().min(0).max(1),
  source_urls: z.array(z.string().url()),
  field_sources: z.record(fieldSourceSchema),
  piste_km: z.number().optional(),
  lift_count: z.number().optional(),
  vertical_drop_m: z.number().optional(),
  base_elevation_m: z.number().optional(),
  top_elevation_m: z.number().optional(),
  lift_pass_day_eur: z.number().optional(),
  estimated_trip_cost_3_days_eur: z.number().optional(),
  glacier_access: z.boolean().optional(),
  snow_reliability_proxy: z.number().min(0).max(1).optional(),
  transfer_complexity: z.number().min(0).max(1).optional(),
  size_category_official: z.enum(['Small', 'Medium', 'Large', 'Mega']).optional(),
  size_category_practical: z.enum(['Small', 'Medium', 'Large', 'Mega']).optional(),
  price_category_ski_only: z.enum(['Budget', 'Midrange', 'Premium', 'Luxury']).optional(),
  price_category_trip_cost: z.enum(['Budget', 'Midrange', 'Premium', 'Luxury']).optional(),
  size_score: z.number().optional(),
  value_score: z.number().optional(),
  snow_score: z.number().optional(),
  access_score: z.number().optional(),
  overall_score: z.number().optional(),
})

export const publishedDatasetSchema = z.object({
  version: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z$/),
  generated_at: z.string(),
  scoring: z.object({
    normalization: z.literal('min-max'),
    boundaries: z.record(boundarySchema),
  }),
  resorts: z.array(resortRecordSchema),
})
```

```ts
// research/targets.ts
export const starterTargets = [
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

```json
// data/published/manifest.json
{
  "currentVersion": "2026-04-03T01-45-00Z",
  "currentPath": "/data/published/current.json"
}
```

```json
// data/published/current.json
{
  "version": "2026-04-03T01-45-00Z",
  "generated_at": "2026-04-03T01:45:00Z",
  "scoring": {
    "normalization": "min-max",
    "boundaries": {
      "piste_km": { "min": 70, "max": 600 },
      "lift_pass_day_eur": { "min": 40, "max": 79 },
      "estimated_trip_cost_3_days_eur": { "min": 420, "max": 880 }
    }
  },
  "resorts": [
    {
      "id": "three-valleys",
      "name": "Les 3 Vallees",
      "country": "France",
      "region": "Savoie",
      "status": "active",
      "overall_confidence": 0.9,
      "source_urls": ["https://www.les3vallees.com/en/"],
      "field_sources": {},
      "piste_km": 600,
      "lift_pass_day_eur": 79,
      "estimated_trip_cost_3_days_eur": 880,
      "size_category_official": "Mega",
      "price_category_ski_only": "Premium"
    },
    {
      "id": "st-anton",
      "name": "St Anton am Arlberg",
      "country": "Austria",
      "region": "Tyrol",
      "status": "active",
      "overall_confidence": 0.88,
      "source_urls": ["https://www.skiarlberg.at/en/"],
      "field_sources": {},
      "piste_km": 305,
      "lift_pass_day_eur": 68,
      "estimated_trip_cost_3_days_eur": 640,
      "size_category_official": "Large",
      "price_category_ski_only": "Premium"
    }
  ]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run research/schema.test.ts`
Expected: PASS with both schema assertions green.

- [ ] **Step 5: Commit**

```bash
git add config/scoring.ts research/schema.ts research/schema.test.ts research/targets.ts data/published/manifest.json data/published/current.json
git commit -m "feat: define schema scoring config and seed targets"
```

### Task 3: Implement Normalization And Source Plumbing

**Files:**
- Create: `research/__fixtures__/sampleResortSource.ts`
- Create: `research/sources/sourceRegistry.ts`
- Create: `research/sources/fetchText.ts`
- Create: `research/normalize/normalizeResort.ts`
- Create: `research/normalize/normalizeResort.test.ts`

- [ ] **Step 1: Write the failing normalization test**

```ts
// research/normalize/normalizeResort.test.ts
import { describe, expect, it } from 'vitest'
import { sampleResortSource } from '../__fixtures__/sampleResortSource'
import { normalizeResort } from './normalizeResort'

describe('normalizeResort', () => {
  it('maps source fields into the canonical schema', () => {
    const result = normalizeResort(sampleResortSource)

    expect(result.id).toBe('three-valleys')
    expect(result.piste_km).toBe(600)
    expect(result.lift_pass_day_eur).toBe(79)
    expect(result.field_sources.piste_km.source).toContain('les3vallees')
    expect(result.status).toBe('active')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run research/normalize/normalizeResort.test.ts`
Expected: FAIL because the fixture and normalizer do not exist.

- [ ] **Step 3: Write the fixture, registry, fetch helper, and normalizer**

```ts
// research/__fixtures__/sampleResortSource.ts
export const sampleResortSource = {
  id: 'three-valleys',
  name: 'Les 3 Vallees',
  country: 'France',
  region: 'Savoie',
  source_urls: ['https://www.les3vallees.com/en/'],
  fields: {
    piste_km: {
      value: 600,
      source: 'https://www.les3vallees.com/en/ski-area/',
      retrieved_at: '2026-04-03T00:00:00Z',
      confidence: 0.95,
    },
    lift_pass_day_eur: {
      value: 79,
      source: 'https://www.les3vallees.com/en/lift-pass/',
      retrieved_at: '2026-04-03T00:00:00Z',
      confidence: 0.9,
    },
  },
}
```

```ts
// research/sources/sourceRegistry.ts
export const sourceRegistry = {
  official: 1,
  tourism: 2,
  trusted_secondary: 3,
}
```

```ts
// research/sources/fetchText.ts
export async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { 'user-agent': 'snowboard-trip-advisor-research/0.1' },
  })

  if (!response.ok) {
    throw new Error(`Fetch failed for ${url}: ${response.status}`)
  }

  return await response.text()
}
```

```ts
// research/normalize/normalizeResort.ts
export type SourceField = {
  value: number | string | boolean
  source: string
  retrieved_at: string
  confidence: number
}

export type SourceRecord = {
  id: string
  name: string
  country: string
  region: string
  source_urls: string[]
  fields: Record<string, SourceField>
}

export function normalizeResort(source: SourceRecord) {
  return {
    id: source.id,
    name: source.name,
    country: source.country,
    region: source.region,
    status: 'active' as const,
    overall_confidence: 0.9,
    source_urls: source.source_urls,
    field_sources: {
      piste_km: {
        source: source.fields.piste_km.source,
        retrieved_at: source.fields.piste_km.retrieved_at,
        confidence: source.fields.piste_km.confidence,
      },
      lift_pass_day_eur: {
        source: source.fields.lift_pass_day_eur.source,
        retrieved_at: source.fields.lift_pass_day_eur.retrieved_at,
        confidence: source.fields.lift_pass_day_eur.confidence,
      },
    },
    piste_km: Number(source.fields.piste_km.value),
    lift_pass_day_eur: Number(source.fields.lift_pass_day_eur.value),
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run research/normalize/normalizeResort.test.ts`
Expected: PASS with canonical mapping assertions green.

- [ ] **Step 5: Commit**

```bash
git add research/__fixtures__/sampleResortSource.ts research/sources/sourceRegistry.ts research/sources/fetchText.ts research/normalize/normalizeResort.ts research/normalize/normalizeResort.test.ts
git commit -m "feat: add source fixture and resort normalization"
```

### Task 4: Implement Config-Driven Categorization And Real Min-Max Scoring

**Files:**
- Create: `research/scoring/computeScores.ts`
- Create: `research/scoring/computeScores.test.ts`
- Modify: `config/scoring.ts`

- [ ] **Step 1: Write the failing scoring tests**

```ts
// research/scoring/computeScores.test.ts
import { describe, expect, it } from 'vitest'
import { computeScores } from './computeScores'

describe('computeScores', () => {
  it('uses config thresholds and returns scoring boundaries', () => {
    const result = computeScores([
      {
        id: 'verbier',
        name: 'Verbier',
        country: 'Switzerland',
        region: 'Valais',
        status: 'active',
        overall_confidence: 0.9,
        source_urls: ['https://www.verbier.ch/'],
        field_sources: {},
        piste_km: 410,
        lift_count: 67,
        vertical_drop_m: 2230,
        top_elevation_m: 3050,
        base_elevation_m: 821,
        lift_pass_day_eur: 79,
        estimated_trip_cost_3_days_eur: 880,
        glacier_access: false,
        snow_reliability_proxy: 0.72,
        transfer_complexity: 0.35,
      },
      {
        id: 'cheap-small',
        name: 'Cheap Small',
        country: 'Austria',
        region: 'Tyrol',
        status: 'active',
        overall_confidence: 0.8,
        source_urls: ['https://example.com'],
        field_sources: {},
        piste_km: 70,
        lift_count: 12,
        vertical_drop_m: 700,
        top_elevation_m: 1900,
        base_elevation_m: 1200,
        lift_pass_day_eur: 40,
        estimated_trip_cost_3_days_eur: 420,
        glacier_access: false,
        snow_reliability_proxy: 0.48,
        transfer_complexity: 0.62,
      },
    ])

    expect(result.boundaries.piste_km).toEqual({ min: 70, max: 410 })
    expect(result.resorts[0].size_category_official).toBe('Mega')
    expect(result.resorts[0].price_category_ski_only).toBe('Premium')
    expect(result.resorts[0].overall_score).toBeGreaterThan(result.resorts[1].overall_score)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run research/scoring/computeScores.test.ts`
Expected: FAIL because `computeScores.ts` does not exist.

- [ ] **Step 3: Write config-driven scoring**

```ts
// research/scoring/computeScores.ts
import {
  scoreWeights,
  sizeThresholds,
  skiOnlyPriceThresholds,
  tripPriceThresholds,
} from '../../config/scoring'

function minMax(values: number[]) {
  return { min: Math.min(...values), max: Math.max(...values) }
}

function normalize(value: number, boundary: { min: number; max: number }, invert = false) {
  if (boundary.max === boundary.min) return 1
  const raw = (value - boundary.min) / (boundary.max - boundary.min)
  return invert ? 1 - raw : raw
}

function sizeBucket(value: number, thresholds: { medium: number; large: number; mega: number }) {
  if (value >= thresholds.mega) return 'Mega'
  if (value >= thresholds.large) return 'Large'
  if (value >= thresholds.medium) return 'Medium'
  return 'Small'
}

function priceBucket(value: number, thresholds: { budget: number; midrange: number; premium: number }) {
  if (value <= thresholds.budget) return 'Budget'
  if (value <= thresholds.midrange) return 'Midrange'
  if (value <= thresholds.premium) return 'Premium'
  return 'Luxury'
}

export function computeScores<T extends {
  piste_km?: number
  vertical_drop_m?: number
  lift_count?: number
  lift_pass_day_eur?: number
  estimated_trip_cost_3_days_eur?: number
  snow_reliability_proxy?: number
  transfer_complexity?: number
}>(resorts: T[]) {
  const pisteBoundary = minMax(resorts.map((r) => r.piste_km ?? 0))
  const skiPriceBoundary = minMax(resorts.map((r) => r.lift_pass_day_eur ?? 0))
  const tripBoundary = minMax(resorts.map((r) => r.estimated_trip_cost_3_days_eur ?? 0))

  const scored = resorts.map((resort) => {
    const practicalSizeValue =
      (resort.piste_km ?? 0) + (resort.vertical_drop_m ?? 0) / 100 + (resort.lift_count ?? 0)

    const sizeScore = normalize(resort.piste_km ?? 0, pisteBoundary)
    const valueScore =
      normalize(resort.lift_pass_day_eur ?? 0, skiPriceBoundary, true) * 0.5 +
      normalize(resort.estimated_trip_cost_3_days_eur ?? 0, tripBoundary, true) * 0.5
    const snowScore = resort.snow_reliability_proxy ?? 0
    const accessScore = 1 - (resort.transfer_complexity ?? 1)

    return {
      ...resort,
      size_category_official: sizeBucket(resort.piste_km ?? 0, sizeThresholds.official),
      size_category_practical: sizeBucket(practicalSizeValue, sizeThresholds.practical),
      price_category_ski_only: priceBucket(resort.lift_pass_day_eur ?? 0, skiOnlyPriceThresholds),
      price_category_trip_cost: priceBucket(resort.estimated_trip_cost_3_days_eur ?? 0, tripPriceThresholds),
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

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run research/scoring/computeScores.test.ts`
Expected: PASS with config-driven categories and min-max boundaries.

- [ ] **Step 5: Commit**

```bash
git add config/scoring.ts research/scoring/computeScores.ts research/scoring/computeScores.test.ts
git commit -m "feat: add config-driven resort scoring"
```

### Task 5: Implement ID-Based Change Reports And Versioned Publishing

**Files:**
- Create: `research/reports/buildChangeReport.ts`
- Create: `research/reports/buildChangeReport.test.ts`
- Create: `research/validate/validatePublishedDataset.ts`
- Create: `research/publish/publishDataset.ts`
- Create: `research/publish/publishDataset.test.ts`

- [ ] **Step 1: Write the failing publish tests**

```ts
// research/reports/buildChangeReport.test.ts
import { describe, expect, it } from 'vitest'
import { buildChangeReport } from './buildChangeReport'

describe('buildChangeReport', () => {
  it('compares records by resort id instead of array index', () => {
    const report = buildChangeReport(
      [{ id: 'a', lift_pass_day_eur: 40 }, { id: 'b', lift_pass_day_eur: 80 }],
      [{ id: 'b', lift_pass_day_eur: 81 }, { id: 'a', lift_pass_day_eur: 40 }],
    )

    expect(report.json.changes).toEqual([
      { id: 'b', fields: ['lift_pass_day_eur'] },
    ])
  })
})
```

```ts
// research/publish/publishDataset.test.ts
import { describe, expect, it } from 'vitest'
import { buildVersionId } from './publishDataset'

describe('buildVersionId', () => {
  it('formats UTC timestamps using the publish convention', () => {
    expect(buildVersionId(new Date('2026-04-03T01:45:00Z'))).toBe(
      '2026-04-03T01-45-00Z',
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run research/reports/buildChangeReport.test.ts research/publish/publishDataset.test.ts`
Expected: FAIL because report and publish modules do not exist.

- [ ] **Step 3: Write the report, validation, and publish primitives**

```ts
// research/reports/buildChangeReport.ts
export function buildChangeReport(
  previous: Array<Record<string, unknown>>,
  next: Array<Record<string, unknown>>,
) {
  const previousById = new Map(previous.map((record) => [String(record.id), record]))
  const changes = next.flatMap((record) => {
    const id = String(record.id)
    const prior = previousById.get(id)
    if (!prior) return [{ id, fields: ['created'] }]

    const fields = Object.keys(record).filter(
      (key) => JSON.stringify(record[key]) !== JSON.stringify(prior[key]),
    )

    return fields.length ? [{ id, fields }] : []
  })

  return {
    json: { changes },
    markdown: changes.map((change) => `- ${change.id}: ${change.fields.join(', ')}`).join('\n'),
  }
}
```

```ts
// research/validate/validatePublishedDataset.ts
import { publishedDatasetSchema } from '../schema'

export function validatePublishedDataset(input: unknown) {
  return publishedDatasetSchema.parse(input)
}
```

```ts
// research/publish/publishDataset.ts
export function buildVersionId(date: Date) {
  return date.toISOString().replace(/:/g, '-').replace(/\.\d{3}Z$/, 'Z')
}
```

- [ ] **Step 4: Extend publishDataset.ts to write a versioned snapshot and manifest**

```ts
// research/publish/publishDataset.ts
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { validatePublishedDataset } from '../validate/validatePublishedDataset'

export function buildVersionId(date: Date) {
  return date.toISOString().replace(/:/g, '-').replace(/\.\d{3}Z$/, 'Z')
}

export async function publishDataset(dataset: unknown, rootDir: string) {
  const validated = validatePublishedDataset(dataset)
  const versionDir = path.join(rootDir, 'data/published/versions', validated.version)
  await mkdir(versionDir, { recursive: true })
  await writeFile(
    path.join(versionDir, 'dataset.json'),
    JSON.stringify(validated, null, 2),
  )
  await writeFile(
    path.join(rootDir, 'data/published/manifest.json'),
    JSON.stringify(
      {
        currentVersion: validated.version,
        currentPath: `/data/published/versions/${validated.version}/dataset.json`,
      },
      null,
      2,
    ),
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- --run research/reports/buildChangeReport.test.ts research/publish/publishDataset.test.ts`
Expected: PASS with ID-based diffing and UTC versioning green.

- [ ] **Step 6: Commit**

```bash
git add research/reports/buildChangeReport.ts research/reports/buildChangeReport.test.ts research/validate/validatePublishedDataset.ts research/publish/publishDataset.ts research/publish/publishDataset.test.ts
git commit -m "feat: add versioned publish and id-based change reports"
```

### Task 6: Add CLI Parsing Without Regressing Public Exports

**Files:**
- Create: `research/cli.ts`
- Create: `research/cli.test.ts`

- [ ] **Step 1: Write the failing CLI tests**

```ts
// research/cli.test.ts
import { describe, expect, it } from 'vitest'
import { parseCommand } from './cli'

describe('parseCommand', () => {
  it('parses refresh stale', () => {
    expect(parseCommand(['refresh', 'stale'])).toEqual({
      action: 'refresh',
      scope: 'stale',
    })
  })

  it('parses publish latest', () => {
    expect(parseCommand(['publish', 'latest'])).toEqual({
      action: 'publish',
      scope: 'latest',
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run research/cli.test.ts`
Expected: FAIL because `research/cli.ts` does not exist.

- [ ] **Step 3: Write CLI parsing and dispatch with stable exports**

```ts
// research/cli.ts
export function parseCommand(args: string[]) {
  const [action, scope = 'all'] = args
  return { action, scope }
}

export async function runCli(args: string[]) {
  const command = parseCommand(args)

  if (command.action === 'refresh') return { ok: true, ...command }
  if (command.action === 'publish') return { ok: true, ...command }

  throw new Error(`Unknown command: ${command.action}`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli(process.argv.slice(2)).then((result) => {
    console.log(JSON.stringify(result))
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run research/cli.test.ts`
Expected: PASS with `parseCommand` still directly importable.

- [ ] **Step 5: Commit**

```bash
git add research/cli.ts research/cli.test.ts
git commit -m "feat: add stable research cli parsing"
```

### Task 7: Add Loader, Query State, Formatting, And Component Primitives

**Files:**
- Create: `src/data/loadPublishedDataset.ts`
- Create: `src/data/loadPublishedDataset.test.ts`
- Create: `src/lib/queryState.ts`
- Create: `src/lib/queryState.test.ts`
- Create: `src/lib/format.ts`
- Create: `src/components/Hero.tsx`
- Create: `src/components/FilterBar.tsx`
- Create: `src/components/FilterBar.test.tsx`
- Create: `src/components/ResortGrid.tsx`
- Create: `src/components/ResortCard.tsx`
- Create: `src/components/ComparePanel.tsx`
- Create: `src/components/ComparePanel.test.tsx`
- Create: `src/components/ResortDetailDrawer.tsx`

- [ ] **Step 1: Write the failing loader and query-state tests**

```ts
// src/data/loadPublishedDataset.test.ts
import { describe, expect, it, vi } from 'vitest'
import { loadPublishedDataset } from './loadPublishedDataset'

describe('loadPublishedDataset', () => {
  it('loads and validates the published dataset', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({
          version: '2026-04-03T01-45-00Z',
          generated_at: '2026-04-03T01:45:00Z',
          scoring: { normalization: 'min-max', boundaries: {} },
          resorts: [],
        }),
      }),
    )

    const result = await loadPublishedDataset()
    expect(result.version).toBe('2026-04-03T01-45-00Z')
  })
})
```

```ts
// src/lib/queryState.test.ts
import { describe, expect, it } from 'vitest'
import { parseCompareIds, serializeCompareIds } from './queryState'

describe('queryState', () => {
  it('round-trips compare ids through URL params', () => {
    expect(parseCompareIds('?compare=verbier,st-anton')).toEqual([
      'verbier',
      'st-anton',
    ])
    expect(serializeCompareIds(['verbier', 'st-anton'])).toBe(
      '?compare=verbier,st-anton',
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/data/loadPublishedDataset.test.ts src/lib/queryState.test.ts`
Expected: FAIL because the loader and query-state helpers do not exist.

- [ ] **Step 3: Write the loader, URL helpers, formatting helpers, and component primitives**

```ts
// src/data/loadPublishedDataset.ts
import type { z } from 'zod'
import { publishedDatasetSchema } from '../../research/schema'

export type PublishedDataset = z.infer<typeof publishedDatasetSchema>

export async function loadPublishedDataset() {
  const response = await fetch('/data/published/current.json')
  return publishedDatasetSchema.parse(await response.json())
}
```

```ts
// src/lib/queryState.ts
export function parseCompareIds(search: string) {
  const params = new URLSearchParams(search)
  const value = params.get('compare')
  return value ? value.split(',').filter(Boolean).slice(0, 4) : []
}

export function serializeCompareIds(ids: string[]) {
  return ids.length ? `?compare=${ids.join(',')}` : ''
}
```

```ts
// src/lib/format.ts
export function formatEuro(value: number) {
  return new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value)
}
```

```tsx
// src/components/Hero.tsx
export default function Hero() {
  return (
    <section className="hero">
      <p className="eyebrow">Europe resort research</p>
      <h1>Snowboard Trip Advisor</h1>
      <p className="hero-copy">Best ski resorts in Europe, ranked by objective metrics</p>
    </section>
  )
}
```

```tsx
// src/components/FilterBar.tsx
type Props = {
  search: string
  onSearchChange: (value: string) => void
}

export default function FilterBar({ search, onSearchChange }: Props) {
  return (
    <label className="filter-bar">
      <span>Search resorts</span>
      <input
        aria-label="Search resorts"
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
      />
    </label>
  )
}
```

```tsx
// src/components/ComparePanel.tsx
export default function ComparePanel({ resorts }: { resorts: Array<{ id: string; name: string }> }) {
  return (
    <section>
      <h2>Compare up to four resorts</h2>
      <ul>
        {resorts.map((resort) => (
          <li key={resort.id}>{resort.name}</li>
        ))}
      </ul>
    </section>
  )
}
```

```tsx
// src/components/ResortCard.tsx
export default function ResortCard({ resort }: { resort: { id: string; name: string } }) {
  return <li data-resort-id={resort.id}>{resort.name}</li>
}
```

```tsx
// src/components/ResortGrid.tsx
import ResortCard from './ResortCard'

export default function ResortGrid({ resorts }: { resorts: Array<{ id: string; name: string }> }) {
  return (
    <ul>
      {resorts.map((resort) => (
        <ResortCard key={resort.id} resort={resort} />
      ))}
    </ul>
  )
}
```

```tsx
// src/components/ResortDetailDrawer.tsx
export default function ResortDetailDrawer({
  resort,
}: {
  resort: { id: string; name: string } | null
}) {
  if (!resort) return null

  return (
    <aside aria-label="Resort details">
      <h3>{resort.name}</h3>
    </aside>
  )
}
```

```tsx
// src/components/FilterBar.test.tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import FilterBar from './FilterBar'

it('updates search text through the callback', () => {
  const onSearchChange = vi.fn()
  render(<FilterBar search="" onSearchChange={onSearchChange} />)

  fireEvent.change(screen.getByRole('textbox', { name: /search resorts/i }), {
    target: { value: 'Verbier' },
  })

  expect(onSearchChange).toHaveBeenCalledWith('Verbier')
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/data/loadPublishedDataset.test.ts src/lib/queryState.test.ts`
Expected: PASS with mocked dataset loading and URL query helpers green.

- [ ] **Step 5: Commit**

```bash
git add src/data/loadPublishedDataset.ts src/data/loadPublishedDataset.test.ts src/lib/queryState.ts src/lib/queryState.test.ts src/lib/format.ts src/components/Hero.tsx src/components/FilterBar.tsx src/components/FilterBar.test.tsx src/components/ResortGrid.tsx src/components/ResortCard.tsx src/components/ComparePanel.tsx src/components/ComparePanel.test.tsx src/components/ResortDetailDrawer.tsx
git commit -m "feat: add frontend data helpers and core components"
```

### Task 8: Compose The Public UI Without Regressing Discovery Features

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/components/ComparePanel.tsx`
- Modify: `src/components/FilterBar.tsx`

- [ ] **Step 1: Write the failing integration tests**

```tsx
// src/App.test.tsx
import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import App from './App'
import * as datasetModule from './data/loadPublishedDataset'

vi.spyOn(datasetModule, 'loadPublishedDataset').mockResolvedValue({
  version: '2026-04-03T01-45-00Z',
  generated_at: '2026-04-03T01:45:00Z',
  scoring: { normalization: 'min-max', boundaries: {} },
  resorts: [
    { id: 'three-valleys', name: 'Les 3 Vallees', country: 'France', region: 'Savoie', status: 'active', overall_confidence: 0.9, source_urls: [], field_sources: {} },
    { id: 'st-anton', name: 'St Anton am Arlberg', country: 'Austria', region: 'Tyrol', status: 'active', overall_confidence: 0.88, source_urls: [], field_sources: {} },
  ],
})

it('preserves the discovery UI while rendering published resorts', async () => {
  render(<App />)
  expect(screen.getByRole('textbox', { name: /search resorts/i })).toBeInTheDocument()
  expect(screen.getByText(/compare up to four resorts/i)).toBeInTheDocument()
  expect(await screen.findByText('Les 3 Vallees')).toBeInTheDocument()
  expect(await screen.findByText('St Anton am Arlberg')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/App.test.tsx`
Expected: FAIL because the app still renders the hero shell only.

- [ ] **Step 3: Compose the UI around the loader instead of replacing it**

```tsx
// src/App.tsx
import { useEffect, useMemo, useState } from 'react'
import Hero from './components/Hero'
import FilterBar from './components/FilterBar'
import ComparePanel from './components/ComparePanel'
import { loadPublishedDataset } from './data/loadPublishedDataset'
import { parseCompareIds } from './lib/queryState'
import './styles/tokens.css'
import './styles/global.css'

type Resort = { id: string; name: string }

export default function App() {
  const [search, setSearch] = useState('')
  const [resorts, setResorts] = useState<Resort[]>([])

  useEffect(() => {
    loadPublishedDataset().then((dataset) => {
      setResorts(dataset.resorts.map(({ id, name }) => ({ id, name })))
    })
  }, [])

  const compareIds = parseCompareIds(window.location.search)
  const filtered = useMemo(
    () => resorts.filter((resort) => resort.name.toLowerCase().includes(search.toLowerCase())),
    [resorts, search],
  )
  const compared = resorts.filter((resort) => compareIds.includes(resort.id))

  return (
    <main className="app-shell">
      <Hero />
      <FilterBar search={search} onSearchChange={setSearch} />
      <ComparePanel resorts={compared} />
      <ResortGrid resorts={filtered} />
    </main>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/App.test.tsx`
Expected: PASS with the search box, compare heading, and published resort names all present.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/App.test.tsx src/components/ComparePanel.tsx src/components/FilterBar.tsx
git commit -m "feat: compose published resort discovery interface"
```

### Task 9: Add Real Verification And Documentation

**Files:**
- Create: `README.md`

- [ ] **Step 1: Run the current full verification and fix any remaining gaps before committing**

Run: `npm test && npm run build`
Expected: Either PASS immediately or reveal the last integration issues that must be fixed before the final commit.

- [ ] **Step 2: Write the project README**

```md
<!-- README.md -->
# Snowboard Trip Advisor

## Commands

- `npm install`
- `npm run dev`
- `npm test`
- `npm run build`
- `npm run research -- refresh stale`
- `npm run research -- publish latest`

## Notes

- Research runs execute locally in the first release.
- Published datasets are versioned by UTC timestamp.
- Compare state is shareable via the `?compare=` URL query parameter.
```

- [ ] **Step 3: Run final verification**

Run: `npm test && npm run build`
Expected: PASS with all tests green and a successful production build.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: add local workflow and verification guide"
```

## Self-Review

### Spec Coverage

- Standalone public app: covered by Tasks 1, 7, 8, and 9.
- Curated dataset generated from real research runs: covered by Tasks 2, 3, 4, 5, and 6.
- Price and size categorization from configuration: covered by Tasks 2 and 4.
- Local-first research execution model: covered by Tasks 5, 6, and 9.
- Shareable compare URL state: covered by Tasks 7 and 8.
- Versioned published snapshots and change reports: covered by Task 5.
- Stored min-max boundaries in published scoring metadata: covered by Tasks 2 and 4.

### Placeholder Scan

- The plan includes exact file paths, commands, and code snippets for each task.
- No deferred or unresolved implementation markers remain.

### Type Consistency

- `parseCommand` remains a direct export from `research/cli.ts`.
- The frontend integration test mocks `loadPublishedDataset`, so it does not rely on a live server in Vitest.
- `App.tsx` composes data loading into the existing discovery UI instead of replacing it.
- Change detection matches by `id`, not array position.
