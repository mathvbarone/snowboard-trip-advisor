# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine
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
