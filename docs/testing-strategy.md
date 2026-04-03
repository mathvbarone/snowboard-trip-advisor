# Testing Strategy

## Fast local loop

- frontend-only work uses `npm run dev`

## CI split

- PR: lint, typecheck, unit/integration, e2e smoke, build checks, contract validation
- Main: rerun release-quality checks, build signed artifact, publish metadata

## Security note

Security gates are part of release readiness, not optional add-ons.
