# Snowboard Trip Advisor

Snowboard Trip Advisor is being built as a decision-support marketplace for a snowboard trip organizer planning a group trip. The product direction is to help that organizer compare resorts using an opinionated decision model, while keeping the underlying reasoning visible instead of turning recommendations into a black box.

The intended comparison model emphasizes riding quality, then resort size, current snow conditions, and lodging cost in the resort region. That model is part of the product direction, not a claim about shipped scoring behavior. The long-term direction is to combine durable resort intelligence with live market signals. Durable intelligence covers facts that do not change quickly, such as terrain, size, and structural resort attributes. Live market signals cover near-real-time snow and lodging conditions that help surface better trip opportunities. Phase 1 is intentionally discovery-only and keeps users on external booking paths rather than trying to become a booking engine.

## Who It Is For

This is for the person planning a snowboard trip for a group, not for someone looking for a generic travel search site.

The primary user wants to:

- compare resorts quickly
- narrow a long list down to a short shortlist
- understand why one resort is ranked above another
- balance riding quality with practical trip cost
- keep the booking step outside the product for now

## Product Direction

The product is semi-opinionated by design. It should guide the user toward a sensible shortlist, but it should still show the underlying reasoning clearly enough that the user can disagree with the recommendation.

The intended decision model is:

1. Riding quality first
2. Resort size second
3. Current snow conditions third
4. Lodging cost in the resort region fourth

The future roadmap should preserve the distinction between:

- durable resort intelligence
- live market signals

That distinction matters because the product should not blur structural resort facts with temporary market conditions. The long-term goal is to combine both so the organizer can rank resorts and see live deal visibility without losing the explanation layer.

## Current State Today

The current implementation is local-first and discovery-focused.

What exists today:

- a frontend that reads published JSON snapshots
- a research pipeline that normalizes resort data, scores it, reports changes, and publishes versioned snapshots
- a shared Zod schema for published and research records
- CLI command parsing for research workflows

What does not exist yet:

- live API ingestion
- a backend service
- direct booking or checkout flows
- a complete end-to-end fetch -> normalize -> score -> publish orchestration path in the CLI

Important implementation note:

- Published data comes from `data/published/current.json`, not from live APIs.
- The lower-level research modules are present and test-covered, but the top-level CLI is still a lightweight command layer.

## How The System Works

At a high level, the system works like this:

1. Research data is collected or seeded into source-shaped records.
2. Source-shaped records are normalized into canonical resort records with source provenance.
3. Objective metrics are scored and categorized for size and price.
4. The dataset is validated and published into `data/published/`.
5. The frontend loads `data/published/current.json` and renders the discovery UI.

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

- [sampleResortSource.ts](research/__fixtures__/sampleResortSource.ts)

### 2. Normalization

The normalizer:

- requires key source fields to exist
- rejects invalid numeric values
- preserves source provenance, including notes

Key file:

- [normalizeResort.ts](research/normalize/normalizeResort.ts)

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

- [scoring.ts](config/scoring.ts)
- [computeScores.ts](research/scoring/computeScores.ts)

### 4. Validation

Before publishing, the dataset is checked for:

- schema correctness
- field-source presence for key published metrics
- derived field presence where required

Key file:

- [validatePublishedDataset.ts](research/validate/validatePublishedDataset.ts)

### 5. Publishing

Publishing writes:

- a versioned snapshot at `data/published/versions/<timestamp>/dataset.json`
- a stable frontend-readable copy at `data/published/current.json`
- a manifest entry in `data/published/manifest.json`

Timestamp versions use the format:

- `YYYY-MM-DDTHH-MM-SSZ`

Key file:

- [publishDataset.ts](research/publish/publishDataset.ts)

### 6. Frontend Consumption

The frontend loads the published dataset with `loadPublishedDataset()`, validates it against the same schema, then renders:

- the page hero
- the search/filter bar
- the compare panel
- the filtered resort list

Compare state is URL-based via:

- `?compare=three-valleys,st-anton`

Key files:

- [App.tsx](src/App.tsx)
- [loadPublishedDataset.ts](src/data/loadPublishedDataset.ts)
- [queryState.ts](src/lib/queryState.ts)

## How To Run The Frontend

### Install Dependencies

```bash
cd /path/to/snowboard-trip-advisor
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

- [cli.ts](research/cli.ts)

Important limitation:

- These commands are currently dispatch scaffolding only. They do not yet orchestrate the full fetch/normalize/score/publish workflow automatically.
