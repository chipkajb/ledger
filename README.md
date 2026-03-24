<p align="center">
  <img src="public/logo.png" alt="Ledger" width="120" />
</p>

# Ledger

A personal finance tracking app for budgeting, mortgage management, and net worth tracking. Built with Next.js, SQLite (via Drizzle ORM), and NextAuth — fully self-hosted, no cloud required.

---

## Features

- **Budget tracker** — envelope-style monthly budgeting with per-category targets, weekly transaction entry, spending vs. target visualizations, and a yearly rollup view
- **Mortgage calculator** — full amortization schedule, refinance comparison, and extra-payment tracking showing how early payments shorten your loan
- **Net worth tracker** — snapshot history with charts across checking, savings, home equity, retirement, investments, HSA, 529, and liabilities
- **Single-user, self-hosted** — runs entirely on your machine or a personal server; your financial data never leaves your hands
- **Import from Excel** — seed script ingests your existing `Budget 2026.xlsx`, `Mortgage.xlsx`, and `Net Worth.xlsx` spreadsheets automatically
- **Docker-ready** — one `docker-compose up` and you're running in production

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | [Next.js 14](https://nextjs.org) (App Router, React Server Components) |
| Language | TypeScript 5 |
| Database | SQLite via [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) |
| ORM | [Drizzle ORM](https://orm.drizzle.team) |
| Auth | [NextAuth v5](https://authjs.dev) — credentials (email + bcrypt password) |
| UI | [Tailwind CSS](https://tailwindcss.com) + [Radix UI](https://www.radix-ui.com) primitives |
| Charts | [Recharts](https://recharts.org) |
| Package manager | [pnpm](https://pnpm.io) |

---

## Prerequisites

- **Node.js ≥ 20** — [nvm](https://github.com/nvm-sh/nvm) or [fnm](https://github.com/Schniz/fnm) recommended
- **pnpm** — `npm install -g pnpm`
- **Docker + Docker Compose** *(optional, for containerised deployment)*

---

## Quick Start (Local Dev)

### 1. Clone the repo

```bash
git clone <repo-url>
cd ledger
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Configure environment variables

```bash
cp .env.example .env.local
```

Open `.env.local` and fill in the values:

```dotenv
# Path to SQLite database (relative path is fine for local dev)
DATABASE_URL=./ledger.db

# Generate with: openssl rand -base64 32
NEXTAUTH_SECRET=<your-secret-here>

# App URL
NEXTAUTH_URL=http://localhost:3000

# Admin login email
ADMIN_EMAIL=admin@ledger.local

# Admin password (plain-text, used only during the seed step)
ADMIN_PASSWORD=<choose-a-strong-password>
```

> **Important:** `.env.local` is listed in `.gitignore` and will **never** be committed. Keep your real credentials there only.

### 4. Seed the database

The seed script creates all tables, loads data from your Excel files (if present), and hashes your `ADMIN_PASSWORD` into the database.

```bash
pnpm seed
```

If you have your Excel spreadsheets in the repo root (`Budget 2026.xlsx`, `Mortgage.xlsx`, `Net Worth.xlsx`), they will be imported automatically. The script is idempotent — it's safe to run multiple times.

### 5. Start the dev server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in with your `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

---

## Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | Path to the SQLite file. Use `/data/ledger.db` for Docker. |
| `NEXTAUTH_SECRET` | ✅ | Random 32-char string for signing JWTs. `openssl rand -base64 32` |
| `NEXTAUTH_URL` | ✅ | Full URL of your deployment, e.g. `https://ledger.example.com` |
| `ADMIN_EMAIL` | ✅ | Email used to log in |
| `ADMIN_PASSWORD` | ✅ (seed only) | Plain-text password hashed during first-run seed. Not needed after seeding. |

---

## All `pnpm` Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start Next.js dev server with hot reload |
| `pnpm build` | Production build |
| `pnpm start` | Start production server (requires `pnpm build` first) |
| `pnpm seed` | Seed / migrate database, import Excel data |
| `pnpm db:studio` | Open Drizzle Studio (visual DB browser) |
| `pnpm db:generate` | Generate new Drizzle migration after schema change |
| `pnpm db:migrate` | Apply pending migrations |
| `pnpm db:push` | Push schema changes directly (dev only) |
| `pnpm lint` | Run ESLint |

---

## Docker Deployment

The easiest way to run Ledger on a server.

### 1. Create a `.env` file for Docker

```bash
# .env  (used by docker-compose, NOT committed)
NEXTAUTH_SECRET=<openssl rand -base64 32>
NEXTAUTH_URL=https://your-domain.com
ADMIN_EMAIL=you@example.com
ADMIN_PASSWORD=<strong-password>
```

### 2. Start the container

```bash
docker-compose up -d
```

This will:
1. Build the multi-stage Docker image (Node 20 Alpine)
2. Mount a named volume at `/data` for persistent database storage
3. Run the seed/migration script on first start
4. Serve the app on port **3000**

### 3. Map to a domain (optional)

Point a reverse proxy (e.g. [Caddy](https://caddyserver.com) or nginx) to `localhost:3000` and configure HTTPS. Update `NEXTAUTH_URL` to your public URL.

### Updating

```bash
docker-compose pull   # or rebuild if building locally
docker-compose up -d --build
```

The database volume persists across container rebuilds — your data is safe.

### Health check

The container exposes `GET /api/health` (no auth required) which returns `{ "status": "ok" }`. Docker Compose polls this every 30 seconds.

---

## Project Structure

```
src/
├── app/
│   ├── api/                  # API route handlers (Next.js Route Handlers)
│   │   ├── auth/             # NextAuth endpoints
│   │   ├── budget/           # Budget categories, transactions, targets, summary
│   │   ├── health/           # Health check
│   │   ├── mortgage/         # Mortgage CRUD + extra payments
│   │   ├── net-worth/        # Snapshot history + latest
│   │   └── settings/         # Password change
│   ├── app/                  # Authenticated app pages (protected by middleware)
│   │   ├── budget/           # Budget views: monthly, yearly, enter expenses
│   │   ├── dashboard/        # Summary dashboard
│   │   ├── mortgage/         # Amortization, overview, extra payments
│   │   ├── net-worth/        # History chart, snapshot entry
│   │   └── settings/         # Account settings
│   └── login/                # Public login page
├── auth.ts                   # NextAuth configuration
├── components/
│   ├── budget/               # Budget-specific React components
│   ├── dashboard/            # Dashboard widgets
│   ├── layout/               # Sidebar + topbar
│   ├── mortgage/             # Mortgage charts and tables
│   ├── net-worth/            # Net worth charts
│   └── ui/                   # Radix UI + Tailwind base components
└── lib/
    ├── db/
    │   ├── index.ts          # Drizzle DB singleton
    │   ├── migrate.ts        # Migration runner
    │   └── schema.ts         # Database schema (single source of truth)
    ├── mortgage.ts           # Amortization calculation logic
    └── utils.ts              # Shared utilities (cn, formatters)

scripts/
└── seed.ts                   # First-run seed script (tables + data import)
```

---

## Database Schema

| Table | Description |
|---|---|
| `budget_categories` | Category definitions with parent group, budget amounts, sort order |
| `transactions` | Individual spending/income entries linked to a category |
| `budget_monthly_targets` | Monthly predicted income and charity carry-over |
| `budget_category_targets` | Per-category monthly target overrides |
| `net_worth_snapshots` | Point-in-time net worth snapshots (assets + liabilities) |
| `mortgages` | Mortgage records (can track original + refinanced) |
| `mortgage_extra_payments` | Extra principal payments with date and amount |
| `app_settings` | Key-value store: admin email, password hash, app config |

---

## Authentication

Ledger is a **single-user app**. Authentication is handled by NextAuth v5 with a Credentials provider:

- Email + password login
- Password stored as a **bcrypt hash** (cost 12) in the `app_settings` table
- JWT session, 30-day expiry
- All `/app/*` routes and non-health API routes are protected by Next.js middleware

**To change your password:** log in → Settings → Change Password.

---

## Importing Excel Data

If you have your finances tracked in Excel, place these files in the repo root before running `pnpm seed`:

| File | What gets imported |
|---|---|
| `Budget 2026.xlsx` | Monthly transactions and category targets |
| `Mortgage.xlsx` | Mortgage terms and extra payment history |
| `Net Worth.xlsx` | Monthly net worth snapshots (requires a `Data` sheet with a `Date` column) |

The seed script gracefully skips any file that isn't present — it won't fail if you only have one of them.

---

## Security Notes

- **`.env.local` is gitignored** — your secrets are never committed
- **Database files (`*.db`) are gitignored** — your financial data stays local
- **`ADMIN_PASSWORD`** is only needed at seed time. After seeding, the hash lives in the database and the plain-text value in `.env.local` can be removed
- **`NEXTAUTH_SECRET`** must be a strong random value — generate one with `openssl rand -base64 32`
- All API routes (except `/api/auth/*` and `/api/health`) require an authenticated session

---

## Development Tips

**Browse the database visually:**
```bash
pnpm db:studio
```
Opens [Drizzle Studio](https://orm.drizzle.team/drizzle-studio/overview) at `https://local.drizzle.studio`.

**Re-seed after schema changes:**
```bash
rm ledger.db && pnpm seed
```

**Modify the schema:**
Edit `src/lib/db/schema.ts`, then run:
```bash
pnpm db:generate   # creates a migration file
pnpm db:migrate    # applies it
```

---

## License

Private / personal use.
