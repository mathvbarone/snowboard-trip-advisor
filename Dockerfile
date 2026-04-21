# syntax=docker/dockerfile:1.7
#
# Base images are pinned by IMMUTABLE DIGEST (not just tag) per the homelab
# repo's security spec — a plain `:22-alpine` / `:1.29-alpine` can drift
# silently as Docker Hub repoints the tag. Pinning the digest means every
# rebuild uses the exact same bits until we deliberately bump.
#
# To refresh: `docker buildx imagetools inspect node:22-alpine` and
# `... nginxinc/nginx-unprivileged:1.29-alpine`, copy the new `Digest:`,
# update here. Rebuild runs Trivy which blocks HIGH/CRITICAL findings.
FROM node:22-alpine@sha256:8ea2348b068a9544dae7317b4f3aafcdc032df1647bb7d768a05a5cad1a7683f AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.29-alpine@sha256:ede1d5af209ef9d29c902e0775ae850ce231d810a6980b1762f81110e757aa96
COPY --chown=101:101 nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder --chown=101:101 /app/dist /usr/share/nginx/html
# Bake the published dataset into the runtime image; the SPA fetches
# /data/published/current.json at startup (src/data/loadPublishedDataset.ts).
# This mirrors the "dataset delivery" model in docs/architecture.md: rollback
# of the app image also rolls back the dataset version.
COPY --from=builder --chown=101:101 /app/data/published /usr/share/nginx/html/data/published
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1
