# Snowboard Trip Advisor Design

## Summary

Snowboard Trip Advisor is a standalone public-facing web app for discovering and comparing the best ski resorts in Europe using objective, inspectable metrics. The product combines a research pipeline with a published curated dataset. The public UI reads only from the published dataset, while separate research runs fetch source material, normalize resort records, detect changes, and republish the dataset when validation passes.

The first release is optimized for objective resort comparison rather than editorial storytelling. Users can rank, filter, and compare resorts by official size, practical size, ski-pass pricing, estimated trip cost, snow reliability proxies, and access-related factors. The ranking model is formula-based and visible in the UI so that users can understand why a resort appears where it does.

## Goals

- Build a public-facing app for browsing the best ski resorts in Europe.
- Categorize resorts by both price and size.
- Support both ski-only price and trip-cost price views.
- Support both official extent and practical-experience size views.
- Start with a curated dataset that can be improved over time.
- Provide a repeatable research workflow that can be rerun periodically.
- Preserve source provenance and freshness so the dataset is auditable.

## Non-Goals

- Real-time live scraping on every user request.
- Booking, checkout, or affiliate integration in the first release.
- User accounts, saved lists, or personalized recommendations in the first release.
- Full automation across arbitrary travel sites with no review or validation layer.

## Product Principles

- Objective over editorial: rankings should be grounded in measurable fields.
- Published data over live fetches: the user experience must remain fast and stable.
- Provenance by default: important fields retain source, retrieval date, and confidence.
- Inspectable scoring: users can understand the formulas behind ranking and categorization.
- Incremental improvement: research can be rerun later without rebuilding the product.

## Users And Primary Use Cases

Primary users are winter sports travelers comparing European resorts for trip planning. They want to quickly identify resorts that match a target budget and preferred mountain scale.

Primary use cases:

- Find large resorts with lower ski-pass pricing.
- Find resorts with lower overall trip cost.
- Compare a shortlist of resorts side by side.
- Understand why one resort ranks above another.
- Check how recently a resort's data was refreshed.

## System Overview

The product has two major layers:

1. A public web application that serves the current published dataset.
2. A research pipeline that refreshes, normalizes, validates, and republishes resort data.

The public site never depends on live scraping during user requests. Research runs operate offline or on demand, write versioned data artifacts, and only replace the published dataset after validation succeeds.

## Proposed Stack

### Frontend

- React with TypeScript
- Vite for development and build
- CSS-based design system with project-level tokens

### Research And Publishing

- Node.js with TypeScript
- Schema validation using a typed runtime validator
- CLI entry points for refresh and publish operations

### Storage

- File-based versioned data directories for the first release
- JSON artifacts for raw snapshots, normalized records, and published dataset
- Configuration files for threshold tuning, source priority, and scoring weights

This avoids early database complexity while keeping the data model explicit and portable.

## Execution Environment

The research CLI is expected to run locally in the first release. It should still be designed as a non-interactive deterministic command-line workflow so it can later be moved into CI or a scheduled server process without architectural changes.

First-release behavior:

- refresh commands are executed by a developer or operator on a local machine
- source fetch failures are surfaced in the refresh report rather than hidden
- fetchers use modest retries and rate limiting appropriate for polite source access
- publish is a separate explicit step after local validation succeeds

## Project Structure

The standalone project should be organized around the distinction between research state and published state.

```text
snowboard-trip-advisor/
  docs/
    superpowers/
      specs/
  src/
    app/
    components/
    pages/
    styles/
    lib/
  research/
    cli/
    sources/
    normalize/
    scoring/
    validate/
  data/
    raw/
    normalized/
    published/
  config/
```

## Geographic Scope

The first release covers ski resorts in Europe. This includes Alpine and non-Alpine resort regions as long as they are relevant to European winter sports travel.

The initial curated list should prioritize broadly known and comparison-relevant destinations first, then expand over time. The research pipeline must support partial coverage without forcing all resorts to be equally complete at launch.

### Initial Dataset Seeding

The first published dataset should be generated by the research CLI against real resort sources. The implementation may include a small hand-authored target manifest containing canonical resort IDs, names, countries, and preferred source URLs, but the actual metric values in the first published dataset should come from researched and normalized fetch results rather than a manually maintained static dataset.

The first implementation plan should therefore sequence initial work as:

1. Define the canonical schema and target manifest shape.
2. Build the research fetch and normalization path for a narrow initial resort set.
3. Generate the first published dataset from real source material.

## Resort Data Model

Each resort record should have a stable canonical identity plus field-level provenance.

### Core Resort Fields

- `id`
- `name`
- `country`
- `region`
- `coordinates`
- `aliases`
- `status`
- `last_researched_at`
- `overall_confidence`

`status` should be an enum with these initial values:

- `active`
- `seasonal_unknown`
- `temporarily_unavailable`
- `closed`

`overall_confidence` should be stored as a `0.0` to `1.0` float. The UI can render this into human labels such as `High`, `Medium`, and `Low`, but the canonical stored field should remain numeric.

### Source Tracking

- `source_urls`
- `source_priority_used`
- `field_sources`

Each important field in `field_sources` should retain:

- `source`
- `retrieved_at`
- `confidence`
- `notes`

### Size Metrics

- `piste_km`
- `lift_count`
- `vertical_drop_m`
- `base_elevation_m`
- `top_elevation_m`
- `ski_area_type`

### Price Metrics

- `lift_pass_day_eur`
- `lift_pass_6_day_eur`
- `lodging_midrange_nightly_eur`
- `estimated_trip_cost_3_days_eur`
- `estimated_trip_cost_6_days_eur`

### Additional Comparison Metrics

- `terrain_parks_count`
- `glacier_access`
- `snow_reliability_proxy`
- `transfer_complexity`
- `nearest_airport_distance_km`

These fields help keep the experience snowboard-trip oriented without abandoning the objective-metrics requirement.

### Derived Fields

- `size_category_official`
- `size_category_practical`
- `price_category_ski_only`
- `price_category_trip_cost`
- `size_score`
- `value_score`
- `access_score`
- `snow_score`
- `overall_score`

### Derived Metric Definitions

`snow_reliability_proxy` should be a normalized numeric score representing expected snow resilience rather than literal snowfall totals. For the first release it should be derived from:

- top elevation
- base elevation
- glacier access when present
- stated typical season length when a reliable source provides it

If season length is unavailable, the proxy should still be computable from the elevation profile and glacier access, but with lower confidence.

`transfer_complexity` should be a normalized numeric score for how difficult it is to reach the resort from a likely arrival hub. For the first release it should combine:

- nearest airport distance
- known transfer count when available
- whether the resort is commonly reachable by a single direct ground transfer

If only airport distance is known, the score may still be computed, but it should carry reduced confidence and source notes.

## Size Categorization

The app must support both requested interpretations of size.

### Official Size

Official size is primarily based on declared skiable extent:

- piste kilometers
- linked ski area structure

Suggested bucket logic:

- `Small`
- `Medium`
- `Large`
- `Mega`

Thresholds should live in configuration, not in scraper code.

### Practical Size

Practical size represents the felt on-mountain experience. It combines:

- piste kilometers
- lift network depth
- vertical drop

This allows a resort with moderate published extent but strong vertical and lift density to be represented more fairly.

The UI should show both the category and the raw ingredients so users can inspect the basis for the label.

## Price Categorization

The app must support both requested interpretations of price.

### Ski-Only Price

This view categorizes resorts by:

- adult day pass price
- adult 6-day pass price

Suggested buckets:

- `Budget`
- `Midrange`
- `Premium`
- `Luxury`

### Trip-Cost Price

This view categorizes resorts by combined travel-facing cost:

- lift pass
- midrange lodging estimate

Derived examples:

- `estimated_trip_cost_3_days_eur`
- `estimated_trip_cost_6_days_eur`

Trip-cost estimates should be clearly described as modeled estimates rather than guaranteed quotes.

## Ranking Model

The ranking system should be deterministic and explainable.

Suggested weighted score:

```text
overall_score =
  size_score +
  value_score +
  snow_score +
  access_score
```

Each score component should be normalized so one metric does not dominate accidentally because of unit scale.

### Ranking Rules

- Default homepage ranking should use the objective weighted model.
- Users should be able to sort directly by individual metrics.
- The UI should expose component scores and raw fields.
- Weight values should be configurable in one place.
- The first release should use fixed min-max normalization for score components.

The first version should not include user-customizable weight tuning. That can come later if needed.

Min-max boundaries should be computed from the currently published dataset at publish time and stored alongside published scoring metadata so the ranking remains explainable and reproducible.

## Research Sources

Research should prefer official resort sources first and fall back to trusted secondary sources only when necessary.

Source tiers:

1. Official resort websites and official pass pages
2. Official destination or tourism pages
3. Trusted comparison or travel data sources

The system should record which source won for each field. It should not silently merge conflicting values without leaving a trace.

## Research Workflow

The research layer must support periodic reruns.

### Inputs

- target scope such as all resorts, stale resorts, country-level, or selected resort IDs
- source priority rules
- scoring and categorization config

### Pipeline Stages

1. Fetch source material
2. Save raw snapshots
3. Extract candidate values
4. Normalize into the canonical schema
5. Compute derived categories and scores
6. Validate required fields and record-level confidence
7. Detect changes relative to the current published dataset
8. Publish the next dataset version if validation succeeds

### Change Detection

Material changes should be highlighted in a machine-readable and human-readable report, especially for:

- pass prices
- piste kilometers
- lift count
- vertical drop
- confidence downgrades
- missing or stale source data

The first release should emit:

- a JSON change report for machine-readable inspection
- a Markdown summary for human review

## Refresh Modes

The CLI should support the recurring research use case explicitly.

Planned commands:

- `refresh all`
- `refresh stale`
- `refresh country <country>`
- `refresh resort <id-or-slug>`
- `publish latest`

The refresh commands should produce updated raw and normalized artifacts plus a report of what changed.

## Published Dataset Versioning

Published datasets should use timestamp-based UTC version identifiers such as `2026-04-03T01-45-00Z`. This makes ordering, rollback, and audit history straightforward.

The publishing layer should maintain:

- versioned published snapshots
- a stable manifest or pointer identifying the current published version
- the ability to repoint to a previous version manually for rollback

## Validation Rules

The publisher should reject obviously bad outputs.

Validation must check:

- required identity fields exist
- numeric values are within plausible ranges
- derived categories can be computed
- source metadata exists for key fields
- published dataset is not partially overwritten on failure

Records with incomplete data can still be published if marked clearly as `partial`, but they must not masquerade as fully verified.

## Public UI

The product is public-facing from the first version and should feel like a serious research tool.

### Homepage

The homepage should combine a strong headline, a ranked resort list, and filter controls without hiding the core data. Users should be able to land on the page and immediately scan resorts by category badges and score breakdown.

### Discovery Surface

The main listing view should support:

- search by resort name
- filters by country and region
- filters by price categories
- filters by size categories
- metric range filters where useful
- sort by overall ranking and by individual metrics

### Resort Cards Or Table

Each visible resort entry should show:

- resort name and location
- overall score
- price badges
- size badges
- key metrics
- freshness indicator

### Resort Detail Page

The resort detail page should show:

- raw objective metrics
- derived price and size categories
- score breakdown
- source provenance
- freshness timestamps
- notes on modeled versus directly sourced fields

### Compare View

Users should be able to compare 2 to 4 resorts side by side on the core objective metrics and derived categories.

Compare selections should be encoded in URL query parameters so the compare view is shareable and survives reloads.

## Visual Direction

The design should avoid generic travel-site defaults. The app should feel sharp, alpine, and data-forward rather than blog-like. The UI can borrow from mapping, weather, and premium outdoor gear aesthetics: cold but not sterile, energetic without being noisy.

The interface should emphasize:

- strong typographic hierarchy
- visible metric chips and score modules
- purposeful contrast
- desktop comparison power with mobile readability

## MVP Scope

Included in MVP:

- standalone frontend app
- curated published dataset
- research CLI with refresh modes
- category and score computation
- homepage discovery view
- resort detail page
- compare view
- published-data refresh workflow

Excluded from MVP:

- user accounts
- favorites or saved comparisons
- live booking integrations
- map-heavy route planning
- automatic continuous crawling with no manual controls

## Error Handling

The system should surface uncertainty explicitly.

Research-side errors:

- source fetch failure
- parse failure
- conflicting values across sources
- insufficient data to compute a score

User-side behavior:

- incomplete resorts remain visible if useful, but carry partial-data indicators
- stale values are marked as stale
- unavailable metrics display as unavailable, not zero

## Testing Strategy

The app needs both research-layer and UI-layer confidence.

### Research Tests

- schema validation tests
- normalizer tests
- score calculation tests
- category threshold tests
- publish gating tests

### Frontend Tests

- page rendering tests
- filter and sorting tests
- compare flow tests
- detail page explanation tests

### End-To-End Checks

- published dataset loads correctly
- main ranking surface is usable on desktop and mobile
- refresh pipeline can update a sample resort set and emit a report

## Rollout Strategy

The first implementation should start with a manageable seed list of high-interest European resorts. The refresh workflow and schema should be designed for expansion from the start, but the initial dataset can be intentionally narrow enough to keep quality high.

Once the architecture is stable, periodic research runs can expand the catalog country by country or by resort priority.

## Open Decisions Resolved In This Design

- The product is standalone.
- The product is public-facing from the first release.
- The dataset starts curated but is improved over time by rerunnable research.
- Ranking is objective-metrics driven.
- Price categorization includes both ski-only and trip-cost views.
- Size categorization includes both official and practical views.
- The public UI reads published data, not live scraped pages.

## Implementation Readiness

This design is intended to support the next step of writing an implementation plan. The first plan should cover project scaffolding, dataset schema, research pipeline foundations, seed data ingestion, scoring and categorization logic, and the initial public UI.
