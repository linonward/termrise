# One image for web, API and Worker on a local machine (docs/architecture/environment.md#docker).
# Not used in Production: web deploys to Vercel, apps/api to Cloudflare Workers.
FROM node:24-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable

WORKDIR /repo
# No Git hooks in the image; no wrangler telemetry.
ENV HUSKY=0 WRANGLER_SEND_METRICS=false

# Dependencies first: the layer is reused until pnpm-lock.yaml changes.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN pnpm fetch
COPY . .
RUN pnpm install --frozen-lockfile --offline

# The browser bundle inlines NEXT_PUBLIC_API_URL at build time; it must match
# apps/web/.env.local.
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
RUN NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL pnpm --filter web build
