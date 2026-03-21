# Multi-stage Next.js build

# Stage 1: Base
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat python3 make g++

# Stage 2: Install dependencies
FROM base AS deps
WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

COPY package.json pnpm-lock.yaml* ./
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

RUN apk add --no-cache libc6-compat

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

# Create data directory
RUN mkdir -p /data && chown nextjs:nodejs /data

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Run migrations and start
CMD ["sh", "-c", "node scripts/seed-runner.js && node server.js"]
