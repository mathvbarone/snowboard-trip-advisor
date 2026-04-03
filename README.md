# Snowboard Trip Advisor

Snowboard Trip Advisor is a standalone TypeScript app for researching and comparing European ski resorts. It has two main halves:

- a public-facing frontend that reads a published dataset and lets users search and compare resorts
- a research pipeline that normalizes resort data, scores it, reports changes, and publishes versioned dataset snapshots

## What The System Does

At a high level, the system works like this:

1. Research data is collected or seeded into canonical resort records.
2. Resort records are normalized into a shared schema with source provenance.
3. Objective metrics are scored and categorized for size and price.
4. The dataset is validated and published into `data/published/`.
5. The frontend loads `data/published/current.json` and renders the discovery UI.

The first release is intentionally local-first. Research commands are meant to run on a developer machine, and the frontend reads local published JSON rather than hitting a backend API.

## Current State

The codebase includes:

- a working frontend app
- a shared Zod schema for published and research records
- normalization logic
- score and category computation
- change reporting
- versioned dataset publishing
- a CLI command parser and dispatcher

Important implementation note:

- The CLI currently recognizes `refresh` and `publish` commands and returns structured command output, but it is not yet wired into a full end-to-end fetch -> normalize -> score -> publish orchestration flow.
- The lower-level research modules exist and are test-covered, but the top-level CLI is still a lightweight command layer rather than a complete production workflow runner.

## Project Structure

### Frontend

- `src/App.tsx`
  Loads the published dataset, applies search filtering, parses compare IDs from the URL, and renders the page shell.
- `src/components/`
  UI building blocks such as the hero, filter bar, compare panel, resort grid, resort card, and detail drawer.
- `src/data/loadPublishedDataset.ts`
  Loads and validates `/data/published/current.json`.
- `src/lib/queryState.ts`
  Parses and serializes compare IDs using the `?compare=` URL parameter.
- `src/lib/format.ts`
  Formatting helpers for display values.

### Research

- `research/schema.ts`
  Shared data contracts for source metadata, resort records, and published datasets.
- `research/normalize/normalizeResort.ts`
  Converts source-shaped data into canonical resort records.
- `research/scoring/computeScores.ts`
  Computes size buckets, price buckets, component scores, overall score, and publish-time min-max boundaries.
- `research/reports/buildChangeReport.ts`
  Produces JSON and Markdown change reports by resort ID.
- `research/validate/validatePublishedDataset.ts`
  Validates published datasets beyond raw schema parsing, including field-source and derived-field checks.
- `research/publish/publishDataset.ts`
  Writes versioned snapshots and refreshes `data/published/current.json`.
- `research/cli.ts`
  Parses and dispatches top-level CLI commands.

### Config And Data

- `config/scoring.ts`
  Thresholds and weights for categories and ranking.
- `data/published/current.json`
  The stable published dataset that the frontend reads.
- `data/published/manifest.json`
  Metadata pointing to the currently published dataset version.
- `data/published/versions/`
  Versioned published snapshots created by the publishing layer.

## How Data Flows Through The System

### 1. Source Data

Source-shaped data starts as a record with:

- identity fields such as `id`, `name`, `country`, and `region`
- source URLs
- field-level source metadata

An example fixture lives in:

- [sampleResortSource.ts](/home/math/Projects/snowboard-trip-advisor/research/__fixtures__/sampleResortSource.ts)

### 2. Normalization

The normalizer:

- requires key source fields to exist
- rejects invalid numeric values
- preserves source provenance, including notes

Key file:

- [normalizeResort.ts](/home/math/Projects/snowboard-trip-advisor/research/normalize/normalizeResort.ts)

### 3. Scoring And Categories

The scoring layer uses thresholds from `config/scoring.ts` to compute:

- `size_category_official`
- `size_category_practical`
- `price_category_ski_only`
- `price_category_trip_cost`
- `size_score`
- `value_score`
- `snow_score`
- `access_score`
- `overall_score`

It also computes publish-time min-max boundaries for:

- `piste_km`
- `lift_pass_day_eur`
- `estimated_trip_cost_3_days_eur`

Key files:

- [scoring.ts](/home/math/Projects/snowboard-trip-advisor/config/scoring.ts)
- [computeScores.ts](/home/math/Projects/snowboard-trip-advisor/research/scoring/computeScores.ts)

### 4. Validation

Before publishing, the dataset is checked for:

- schema correctness
- field-source presence for key published metrics
- derived field presence where required

Key file:

- [validatePublishedDataset.ts](/home/math/Projects/snowboard-trip-advisor/research/validate/validatePublishedDataset.ts)

### 5. Publishing

Publishing writes:

- a versioned snapshot at `data/published/versions/<timestamp>/dataset.json`
- a stable frontend-readable copy at `data/published/current.json`
- a manifest entry in `data/published/manifest.json`

Timestamp versions use the format:

- `YYYY-MM-DDTHH-MM-SSZ`

Key file:

- [publishDataset.ts](/home/math/Projects/snowboard-trip-advisor/research/publish/publishDataset.ts)

### 6. Frontend Consumption

The frontend loads the published dataset with `loadPublishedDataset()`, validates it against the same schema, then renders:

- the page hero
- the search/filter bar
- the compare panel
- the filtered resort list

Compare state is URL-based via:

- `?compare=three-valleys,st-anton`

Key files:

- [App.tsx](/home/math/Projects/snowboard-trip-advisor/src/App.tsx)
- [loadPublishedDataset.ts](/home/math/Projects/snowboard-trip-advisor/src/data/loadPublishedDataset.ts)
- [queryState.ts](/home/math/Projects/snowboard-trip-advisor/src/lib/queryState.ts)

## How To Run The Frontend

### Install Dependencies

```bash
cd /home/math/Projects/snowboard-trip-advisor
npm install
```

### Start The Dev Server

```bash
npm run dev
```

Vite will print a local URL, typically something like:

```text
http://localhost:5173/
```

Open that URL in your browser.

### What You Should See

The frontend should:

- render the `Snowboard Trip Advisor` hero
- show a `Search resorts` input
- load resorts from `data/published/current.json`
- support compare-state parsing from the URL

Example compare URL:

```text
http://localhost:5173/?compare=three-valleys,st-anton
```

## How To Use The CLI

The project exposes the CLI through:

```bash
npm run research -- <command> <scope>
```

### Supported Commands Today

#### Refresh

```bash
npm run research -- refresh stale
```

#### Publish

```bash
npm run research -- publish latest
```

### What The CLI Currently Does

At the moment, the CLI:

- parses `refresh` and `publish`
- preserves the command scope
- returns a structured result
- rejects unknown commands

Examples:

```bash
npm run research -- refresh stale
npm run research -- publish latest
```

The current implementation is in:

- [cli.ts](/home/math/Projects/snowboard-trip-advisor/research/cli.ts)

Important limitation:

- These commands are currently dispatch scaffolding only. They do not yet orchestrate the full fetch/normalize/score/publish workflow automatically.

## How Research Is Intended To Work

The intended local research workflow is:

1. Identify a source record or target resort list.
2. Normalize source data into canonical resort records.
3. Compute categories and scores.
4. Build change reports against the current published dataset.
5. Validate the result.
6. Publish a new versioned snapshot and refresh `current.json`.

Today, this workflow is implemented as lower-level modules rather than one top-level CLI command.

That means the research layer is usable for development and testing, but still needs orchestration glue if you want one command to perform the whole refresh pipeline.

## Main Files By Responsibility

### Discovery UI

- [Hero.tsx](/home/math/Projects/snowboard-trip-advisor/src/components/Hero.tsx)
- [FilterBar.tsx](/home/math/Projects/snowboard-trip-advisor/src/components/FilterBar.tsx)
- [ComparePanel.tsx](/home/math/Projects/snowboard-trip-advisor/src/components/ComparePanel.tsx)
- [ResortGrid.tsx](/home/math/Projects/snowboard-trip-advisor/src/components/ResortGrid.tsx)
- [ResortCard.tsx](/home/math/Projects/snowboard-trip-advisor/src/components/ResortCard.tsx)
- [ResortDetailDrawer.tsx](/home/math/Projects/snowboard-trip-advisor/src/components/ResortDetailDrawer.tsx)

### Data Contracts And Pipeline

- [schema.ts](/home/math/Projects/snowboard-trip-advisor/research/schema.ts)
- [normalizeResort.ts](/home/math/Projects/snowboard-trip-advisor/research/normalize/normalizeResort.ts)
- [computeScores.ts](/home/math/Projects/snowboard-trip-advisor/research/scoring/computeScores.ts)
- [buildChangeReport.ts](/home/math/Projects/snowboard-trip-advisor/research/reports/buildChangeReport.ts)
- [validatePublishedDataset.ts](/home/math/Projects/snowboard-trip-advisor/research/validate/validatePublishedDataset.ts)
- [publishDataset.ts](/home/math/Projects/snowboard-trip-advisor/research/publish/publishDataset.ts)

## Testing

Run the full test suite:

```bash
npm test
```

Run the production build:

```bash
npm run build
```

Run a focused test file:

```bash
npm test -- --run src/App.test.tsx
```

## Notes And Caveats

- Research runs are local-first in this release.
- The frontend depends on `data/published/current.json`.
- Compare state is shareable via the `?compare=` query parameter.
- The CLI is implemented, but its dispatch is still a thin command layer rather than a full orchestration entrypoint.
- The current published dataset is seeded example data, not a complete live resort catalog.
