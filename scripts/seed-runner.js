/**
 * Docker entrypoint helper: runs DB migrations and bootstraps admin credentials.
 * Executed by the Dockerfile CMD before starting the Next.js server.
 *
 * Environment variables (set in docker-compose.yml / .env):
 *   DATABASE_URL    - absolute path to the SQLite file (e.g. /data/ledger.db)
 *   ADMIN_EMAIL     - admin login email
 *   ADMIN_PASSWORD  - plain-text password (hashed and stored; never persisted as-is)
 */

"use strict";

const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const path = require("path");

const DB_PATH = process.env.DATABASE_URL ?? "./ledger.db";
const dbPath = path.isAbsolute(DB_PATH)
  ? DB_PATH
  : path.resolve(process.cwd(), DB_PATH);

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ─── Migrations ────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS budget_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    parent_category TEXT NOT NULL,
    budget_pct REAL,
    budget_amount REAL,
    is_income_source INTEGER NOT NULL DEFAULT 0,
    is_funds INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    deprecated INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    amount REAL NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    category_id INTEGER NOT NULL REFERENCES budget_categories(id),
    week_label TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS transactions_date_idx ON transactions(date);
  CREATE INDEX IF NOT EXISTS transactions_category_idx ON transactions(category_id);

  CREATE TABLE IF NOT EXISTS budget_monthly_targets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month TEXT NOT NULL,
    predicted_income REAL NOT NULL DEFAULT 0,
    charity_bank_carryover REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE UNIQUE INDEX IF NOT EXISTS budget_monthly_targets_month_idx ON budget_monthly_targets(month);

  CREATE TABLE IF NOT EXISTS budget_category_targets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month TEXT NOT NULL,
    category_id INTEGER NOT NULL REFERENCES budget_categories(id),
    target_amount REAL NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS budget_category_targets_month_idx ON budget_category_targets(month);
  CREATE INDEX IF NOT EXISTS budget_category_targets_category_idx ON budget_category_targets(category_id);

  CREATE TABLE IF NOT EXISTS net_worth_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_date TEXT NOT NULL,
    checking REAL NOT NULL DEFAULT 0,
    savings REAL NOT NULL DEFAULT 0,
    home_equity REAL NOT NULL DEFAULT 0,
    retirement_401k REAL NOT NULL DEFAULT 0,
    hsa_hra REAL NOT NULL DEFAULT 0,
    investments REAL NOT NULL DEFAULT 0,
    plan_529 REAL NOT NULL DEFAULT 0,
    teamworks_equity REAL NOT NULL DEFAULT 0,
    mortgage_balance REAL NOT NULL DEFAULT 0,
    student_loans REAL NOT NULL DEFAULT 0,
    personal_loans REAL NOT NULL DEFAULT 0,
    total_assets REAL NOT NULL DEFAULT 0,
    total_liabilities REAL NOT NULL DEFAULT 0,
    net_worth REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS net_worth_snapshots_date_idx ON net_worth_snapshots(snapshot_date);

  CREATE TABLE IF NOT EXISTS mortgages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL,
    house_price REAL NOT NULL,
    down_payment REAL NOT NULL,
    loan_amount REAL NOT NULL,
    annual_rate REAL NOT NULL,
    term_years INTEGER NOT NULL DEFAULT 30,
    payments_per_year INTEGER NOT NULL DEFAULT 12,
    first_payment_date TEXT NOT NULL,
    monthly_escrow REAL NOT NULL DEFAULT 0,
    pmi REAL NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS mortgage_extra_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mortgage_id INTEGER NOT NULL REFERENCES mortgages(id) ON DELETE CASCADE,
    payment_date TEXT NOT NULL,
    amount REAL NOT NULL,
    note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS mortgage_extra_payments_mortgage_idx ON mortgage_extra_payments(mortgage_id);
  CREATE INDEX IF NOT EXISTS mortgage_extra_payments_date_idx ON mortgage_extra_payments(payment_date);

  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

console.log("✅ Database migrations complete");

// ─── Column migrations (additive, idempotent) ──────────────────────────────────
const budgetCatColumns = db.pragma("table_info(budget_categories)");
if (!budgetCatColumns.some((c) => c.name === "deprecated")) {
  db.exec(`ALTER TABLE budget_categories ADD COLUMN deprecated INTEGER NOT NULL DEFAULT 0`);
  console.log("✅ Added deprecated column to budget_categories");
}

// ─── Bootstrap admin credentials ───────────────────────────────────────────────

const adminEmail = process.env.ADMIN_EMAIL;
const adminPassword = process.env.ADMIN_PASSWORD;

if (adminEmail && adminPassword) {
  const hash = bcrypt.hashSync(adminPassword, 12);

  const upsert = db.prepare(`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `);

  upsert.run("admin_email", adminEmail);
  upsert.run("admin_password_hash", hash);

  console.log("✅ Admin credentials set for:", adminEmail);
} else {
  console.warn(
    "⚠️  ADMIN_EMAIL or ADMIN_PASSWORD not set — skipping credential bootstrap"
  );
}

db.close();
