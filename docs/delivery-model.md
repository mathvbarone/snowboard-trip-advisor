# Delivery Model

## Repositories

- Application source: `snowboard-trip-advisor`
- Deployable manifests and environment overlays: `home-lab`

## Delivery Flow

1. App PR validates code, tests, and release-contract expectations.
2. Merge to `main` produces the signed release artifact and metadata.
3. CI opens an image-only promotion PR in `home-lab`.
4. `home-lab` CI validates the production desired state.
5. Argo CD deploys after the promotion PR is merged.

## Rule

The app repo is not the source of truth for production manifests.
