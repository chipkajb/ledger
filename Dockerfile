# Multi-stage Next.js build

# Stage 1: Base
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat python3 make g++

# Stage 2: Install dependencies
FROM base AS deps
WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# include .pnpmfile.cjs so pnpmfileChecksum in the lockfile matches (see pnpm-lock.yaml)
COPY package.json pnpm-lock.yaml* .pnpmfile.cjs* ./
RUN pnpm install --frozen-lockfile

# Stage 3: Build
FROM base AS builder
WORKDIR /app
RUN npm install -g pnpm

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL=/data/ledger.db

RUN pnpm build

# Stage 4: Production runner
FROM node:20-alpine AS runner
WORKDIR /app

RUN apk add --no-cache libc6-compat su-exec

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL=/data/ledger.db

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built app
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy seed script and migrations
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Rebuild native addon against this image's musl (copied node_modules may not match runner libc)
RUN apk add --no-cache python3 make g++ \
  && npm rebuild better-sqlite3 \
  && apk del python3 make g++

# Create data directory
RUN mkdir -p /data && chown nextjs:nodejs /data

COPY deploy/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

ENTRYPOINT ["/docker-entrypoint.sh"]
# Run DB bootstrap (seed.ts via tsx), then Next standalone server
CMD ["sh", "-c", "node ./node_modules/tsx/dist/cli.mjs scripts/seed.ts && exec node server.js"]
