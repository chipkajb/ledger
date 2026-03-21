/**
 * Seed script: imports historical data from Excel files into the SQLite database.
 * Run with: pnpm seed
 *
 * Reads from the parent directory (workspace/ledger):
 * - Budget 2026.xlsx
 * - Mortgage.xlsx
 * - Net Worth.xlsx
 */

import Database from "better-sqlite3";
import * as XLSX from "xlsx";
import * as bcrypt from "bcryptjs";
import path from "path";
import { format, addDays } from "date-fns";

const DB_PATH = process.env.DATABASE_URL ?? "./ledger.db";
const dbPath = path.isAbsolute(DB_PATH)
  ? DB_PATH
  : path.resolve(process.cwd(), DB_PATH);

// The xlsx files live in the main repo root (3 levels up from the worktree)
const XLSX_BASE = path.resolve(process.cwd(), "../../..");

// Initialize DB
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ─── Run migrations ────────────────────────────────────────────────────────────
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
    month TEXT NOT NULL UNIQUE,
    predicted_income REAL NOT NULL DEFAULT 0,
    charity_bank_carryover REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS budget_category_targets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month TEXT NOT NULL,
    category_id INTEGER NOT NULL REFERENCES budget_categories(id),
    target_amount REAL NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

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

  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

console.log("✅ Tables created");

// ─── Helper: Excel serial date to ISO date ─────────────────────────────────────
function excelDateToISO(serial: number): string {
  // Excel epoch is Jan 1, 1900 (with the 1900 leap year bug)
  const excelEpoch = new Date(1899, 11, 30); // Dec 30, 1899
  const d = addDays(excelEpoch, serial);
  return format(d, "yyyy-MM-dd");
}

function getISOWeek(dateStr: string): string {
  const d = new Date(dateStr);
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const startOfWeek1 = new Date(jan4);
  startOfWeek1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  const diffMs = d.getTime() - startOfWeek1.getTime();
  const weekNum = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1;
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

// ─── Seed Budget Categories ────────────────────────────────────────────────────
const CATEGORIES = [
  // Income
  { name: "Teamworks", parent: "Income", isIncome: true, sort: 10 },
  { name: "Riverview/SynergenX", parent: "Income", isIncome: true, sort: 11 },
  { name: "Gifts/Other", parent: "Income", isIncome: true, sort: 12 },
  // Funds
  { name: "Savings/Emergency", parent: "Funds", isFunds: true, sort: 20 },
  // Giving
  { name: "Church Offering", parent: "Giving", budgetAmount: 850, sort: 30 },
  { name: "Charity/Other", parent: "Giving", budgetAmount: 500, sort: 31 },
  { name: "Hospitality", parent: "Giving", budgetAmount: 350, sort: 32 },
  // Housing
  { name: "Mortgage", parent: "Housing", budgetAmount: 3993.23, sort: 40 },
  { name: "Water/Trash", parent: "Housing", budgetAmount: 200, sort: 41 },
  { name: "Propane", parent: "Housing", budgetAmount: 100, sort: 42 },
  { name: "Electricity", parent: "Housing", budgetAmount: 0, sort: 43 },
  { name: "Cable/Internet", parent: "Housing", budgetAmount: 120, sort: 44 },
  // Insurance
  { name: "Auto & Life", parent: "Insurance", budgetAmount: 48.36, sort: 50 },
  // Transportation
  { name: "Gas/Parking", parent: "Transportation", budgetAmount: 150, sort: 60 },
  { name: "Maintenance", parent: "Transportation", budgetAmount: 50, sort: 61 },
  // Food
  { name: "Groceries", parent: "Food", budgetAmount: 350, sort: 70 },
  { name: "Restaurants", parent: "Food", budgetAmount: 200, sort: 71 },
  // Personal
  { name: "Clothing", parent: "Personal", budgetAmount: 50, sort: 80 },
  { name: "Phone", parent: "Personal", budgetAmount: 110.26, sort: 81 },
  { name: "Home Improvement", parent: "Personal", budgetAmount: 50, sort: 82 },
  { name: "Furniture", parent: "Personal", budgetAmount: 0, sort: 83 },
  { name: "Travel/Entertainment", parent: "Personal", budgetAmount: 0, sort: 84 },
  { name: "Fun Money", parent: "Personal", budgetAmount: 0, sort: 85 },
  // Health
  { name: "Doctor Visits", parent: "Health", budgetAmount: 0, sort: 90 },
  { name: "Dog", parent: "Health", budgetAmount: 0, sort: 91 },
  // Debt
  { name: "Car Payment", parent: "Debt", budgetAmount: 0, sort: 100 },
  // Education
  { name: "Other", parent: "Education", budgetAmount: 0, sort: 110 },
];

const insertCategory = db.prepare(`
  INSERT OR IGNORE INTO budget_categories (name, parent_category, budget_amount, is_income_source, is_funds, sort_order)
  VALUES (?, ?, ?, ?, ?, ?)
`);

for (const cat of CATEGORIES) {
  insertCategory.run(
    cat.name,
    cat.parent,
    cat.budgetAmount ?? null,
    cat.isIncome ? 1 : 0,
    cat.isFunds ? 1 : 0,
    cat.sort
  );
}

console.log(`✅ Inserted ${CATEGORIES.length} budget categories`);

// Get category ID map
const catRows = db.prepare("SELECT id, name FROM budget_categories").all() as Array<{id: number; name: string}>;
const catMap = new Map(catRows.map((r) => [r.name, r.id]));

// ─── Seed Net Worth Snapshots ──────────────────────────────────────────────────
try {
  const nwPath = path.join(XLSX_BASE, "Net Worth.xlsx");
  const wb = XLSX.readFile(nwPath);
  const sheet = wb.Sheets["Data"];
  if (!sheet) throw new Error("No 'Data' sheet found");

  const rows = (XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: 0,
  }) as unknown) as Array<Array<number | string>>;

  // Find header row - look for "Date" in first column
  let headerRow = -1;
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).includes("Date") || String(rows[i][0]).toLowerCase() === "date") {
      headerRow = i;
      break;
    }
  }

  if (headerRow === -1) headerRow = 0;

  const headers = rows[headerRow].map((h) => String(h).trim());

  const insertSnap = db.prepare(`
    INSERT OR IGNORE INTO net_worth_snapshots
    (snapshot_date, checking, savings, home_equity, retirement_401k, hsa_hra,
     investments, plan_529, teamworks_equity, mortgage_balance, student_loans,
     personal_loans, total_assets, total_liabilities, net_worth)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Column mapping helper
  const findCol = (names: string[]): number => {
    for (const name of names) {
      const idx = headers.findIndex((h) =>
        h.toLowerCase().includes(name.toLowerCase())
      );
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const colDate = 0;
  const colChecking = findCol(["Checking"]);
  const colSavings = findCol(["Savings"]);
  const colHomeEquity = findCol(["Home Equity", "HomeEquity"]);
  const col401k = findCol(["401K", "401k", "Retirement"]);
  const colHsa = findCol(["HSA", "HRA"]);
  const colInvestments = findCol(["Investment"]);
  const col529 = findCol(["529"]);
  const colTeamworks = findCol(["Teamworks"]);
  const colMortgage = findCol(["Mortgage"]);
  const colStudentLoans = findCol(["Student"]);
  const colPersonalLoans = findCol(["Personal Loan", "PersonalLoan"]);

  let insertedCount = 0;
  const insertBatch = db.transaction((dataRows: Array<Array<number | string>>) => {
    for (const row of dataRows) {
      const rawDate = row[colDate];
      if (!rawDate || rawDate === 0 || rawDate === "Date") continue;

      let dateStr: string;
      if (typeof rawDate === "number" && rawDate > 40000) {
        dateStr = excelDateToISO(rawDate);
      } else if (typeof rawDate === "string" && rawDate.includes("/")) {
        const parts = rawDate.split("/");
        dateStr = `${parts[2]}-${parts[0].padStart(2, "0")}-${parts[1].padStart(2, "0")}`;
      } else if (typeof rawDate === "string" && rawDate.includes("-")) {
        dateStr = rawDate;
      } else {
        continue;
      }

      const getVal = (col: number) => col >= 0 ? (Number(row[col]) || 0) : 0;

      const checking = getVal(colChecking);
      const savings = getVal(colSavings);
      const homeEquity = getVal(colHomeEquity);
      const retirement401k = getVal(col401k);
      const hsaHra = getVal(colHsa);
      const investments = getVal(colInvestments);
      const plan529 = getVal(col529);
      const teamworksEquity = getVal(colTeamworks);
      const mortgageBalance = getVal(colMortgage);
      const studentLoans = getVal(colStudentLoans);
      const personalLoans = getVal(colPersonalLoans);

      const totalAssets = checking + savings + homeEquity + retirement401k + hsaHra + investments + plan529 + teamworksEquity;
      const totalLiabilities = mortgageBalance + studentLoans + personalLoans;
      const netWorth = totalAssets - totalLiabilities;

      insertSnap.run(
        dateStr, checking, savings, homeEquity, retirement401k, hsaHra,
        investments, plan529, teamworksEquity, mortgageBalance, studentLoans,
        personalLoans, totalAssets, totalLiabilities, netWorth
      );
      insertedCount++;
    }
  });

  insertBatch(rows.slice(headerRow + 1));
  console.log(`✅ Inserted ${insertedCount} net worth snapshots`);
} catch (err) {
  console.warn("⚠️  Could not seed net worth data:", err);
}

// ─── Seed Mortgages ────────────────────────────────────────────────────────────
const insertMortgage = db.prepare(`
  INSERT INTO mortgages (label, house_price, down_payment, loan_amount, annual_rate, term_years, payments_per_year, first_payment_date, monthly_escrow, pmi, is_active, notes)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

// Clear existing mortgages for idempotency
db.prepare("DELETE FROM mortgage_extra_payments").run();
db.prepare("DELETE FROM mortgages").run();

const m1 = insertMortgage.run(
  "Original Mortgage",
  815000, 369500, 445500, 0.06625, 30, 12,
  "2025-09-01", 645.78, 0, 0,
  "Original loan at 6.625%"
);

const m2 = insertMortgage.run(
  "Refinanced Mortgage",
  815000, 373490, 441510, 0.0599, 30, 12,
  "2026-04-01", 645.78, 0, 1,
  "Refinanced at 5.99% in early 2026"
);

const m1Id = m1.lastInsertRowid as number;
const m2Id = m2.lastInsertRowid as number;

// Extra payments for original mortgage
const insertExtra = db.prepare(`
  INSERT INTO mortgage_extra_payments (mortgage_id, payment_date, amount, note)
  VALUES (?, ?, ?, ?)
`);
insertExtra.run(m1Id, "2025-12-01", 3000, "Extra payment December 2025");
insertExtra.run(m1Id, "2026-01-01", 500, "Extra payment January 2026");
insertExtra.run(m1Id, "2026-02-01", 500, "Extra payment February 2026");

console.log("✅ Inserted 2 mortgages + 3 extra payments");

// ─── Seed Budget Data from Budget 2026.xlsx ────────────────────────────────────
try {
  const budgetPath = path.join(XLSX_BASE, "Budget 2026.xlsx");
  const wb = XLSX.readFile(budgetPath);

  const monthSheets: Record<string, string> = {
    "January": "2026-01",
    "February": "2026-02",
    "March": "2026-03",
  };

  const insertTx = db.prepare(`
    INSERT INTO transactions (date, amount, description, category_id, week_label)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertMonthlyTarget = db.prepare(`
    INSERT OR REPLACE INTO budget_monthly_targets (month, predicted_income, charity_bank_carryover)
    VALUES (?, ?, ?)
  `);

  const insertCatTarget = db.prepare(`
    INSERT OR REPLACE INTO budget_category_targets (month, category_id, target_amount)
    VALUES (?, ?, ?)
  `);

  // Per-month actual transaction data based on spec
  const MONTHLY_DATA: Record<string, {
    predictedIncome: number;
    charityCarryover: number;
    transactions: Array<{ date: string; amount: number; description: string; category: string }>;
    categoryTargets: Array<{ category: string; target: number }>;
  }> = {
    "2026-01": {
      predictedIncome: 17000,
      charityCarryover: 13192.89,
      categoryTargets: [
        { category: "Teamworks", target: 9000 },
        { category: "Riverview/SynergenX", target: 7000 },
        { category: "Gifts/Other", target: 1000 },
        { category: "Church Offering", target: 850 },
        { category: "Charity/Other", target: 500 },
        { category: "Hospitality", target: 350 },
        { category: "Mortgage", target: 3993.23 },
        { category: "Water/Trash", target: 635.78 },
        { category: "Cable/Internet", target: 120 },
        { category: "Auto & Life", target: 64.38 },
        { category: "Gas/Parking", target: 150 },
        { category: "Maintenance", target: 50 },
        { category: "Groceries", target: 350 },
        { category: "Restaurants", target: 200 },
        { category: "Phone", target: 110.26 },
        { category: "Fun Money", target: 100 },
      ],
      transactions: [
        // Income
        { date: "2026-01-15", amount: 8992.96, description: "Teamworks paycheck", category: "Teamworks" },
        { date: "2026-01-15", amount: 4031.83, description: "Riverview/SynergenX", category: "Riverview/SynergenX" },
        { date: "2026-01-20", amount: 4026.98, description: "Gifts/Other income", category: "Gifts/Other" },
        // Housing
        { date: "2026-01-01", amount: 3993.23, description: "Mortgage payment", category: "Mortgage" },
        { date: "2026-01-15", amount: 635.78, description: "Water/Trash", category: "Water/Trash" },
        { date: "2026-01-20", amount: 120.00, description: "Cable/Internet", category: "Cable/Internet" },
        // Insurance
        { date: "2026-01-05", amount: 64.38, description: "Auto & Life Insurance", category: "Auto & Life" },
        // Transportation
        { date: "2026-01-10", amount: 46.18, description: "Gas", category: "Gas/Parking" },
        // Food
        { date: "2026-01-07", amount: 198.45, description: "Groceries", category: "Groceries" },
        { date: "2026-01-14", amount: 196.51, description: "Groceries", category: "Groceries" },
        { date: "2026-01-21", amount: 201.85, description: "Groceries - HEB", category: "Groceries" },
        { date: "2026-01-10", amount: 87.42, description: "Restaurant", category: "Restaurants" },
        { date: "2026-01-17", amount: 156.88, description: "Restaurants", category: "Restaurants" },
        { date: "2026-01-24", amount: 260.63, description: "Restaurants", category: "Restaurants" },
        // Personal
        { date: "2026-01-12", amount: 124.65, description: "Clothing", category: "Clothing" },
        { date: "2026-01-08", amount: 438.38, description: "Phone bill", category: "Phone" },
        { date: "2026-01-15", amount: 36.88, description: "Home improvement", category: "Home Improvement" },
        { date: "2026-01-20", amount: 249.52, description: "Fun money", category: "Fun Money" },
        // Health
        { date: "2026-01-22", amount: 130.00, description: "Doctor visit", category: "Doctor Visits" },
        // Giving
        { date: "2026-01-04", amount: 400.00, description: "Church offering", category: "Church Offering" },
        { date: "2026-01-11", amount: 192.03, description: "Charity", category: "Charity/Other" },
        // Funds
        { date: "2026-01-31", amount: 10312.88, description: "Transfer to savings", category: "Savings/Emergency" },
      ],
    },
    "2026-02": {
      predictedIncome: 17000,
      charityCarryover: 0, // Will be computed
      categoryTargets: [
        { category: "Teamworks", target: 9000 },
        { category: "Riverview/SynergenX", target: 7000 },
        { category: "Gifts/Other", target: 1000 },
        { category: "Church Offering", target: 850 },
        { category: "Charity/Other", target: 500 },
        { category: "Hospitality", target: 350 },
        { category: "Mortgage", target: 3993.23 },
        { category: "Water/Trash", target: 200 },
        { category: "Cable/Internet", target: 120 },
        { category: "Auto & Life", target: 48.36 },
        { category: "Gas/Parking", target: 150 },
        { category: "Groceries", target: 350 },
        { category: "Restaurants", target: 200 },
        { category: "Phone", target: 110.26 },
      ],
      transactions: [
        // Income
        { date: "2026-02-14", amount: 8992.96, description: "Teamworks paycheck", category: "Teamworks" },
        { date: "2026-02-14", amount: 4031.83, description: "Riverview/SynergenX", category: "Riverview/SynergenX" },
        { date: "2026-02-20", amount: 4026.98, description: "Gifts/Other income", category: "Gifts/Other" },
        // Housing
        { date: "2026-02-01", amount: 3993.23, description: "Mortgage payment", category: "Mortgage" },
        { date: "2026-02-10", amount: 180.00, description: "Water/Trash", category: "Water/Trash" },
        { date: "2026-02-15", amount: 120.00, description: "Cable/Internet", category: "Cable/Internet" },
        // Insurance
        { date: "2026-02-05", amount: 48.36, description: "Auto & Life Insurance", category: "Auto & Life" },
        // Food
        { date: "2026-02-07", amount: 180.22, description: "Groceries", category: "Groceries" },
        { date: "2026-02-14", amount: 205.33, description: "Groceries", category: "Groceries" },
        { date: "2026-02-21", amount: 190.88, description: "Groceries", category: "Groceries" },
        { date: "2026-02-08", amount: 95.77, description: "Restaurant", category: "Restaurants" },
        { date: "2026-02-15", amount: 145.62, description: "Restaurants", category: "Restaurants" },
        // Personal
        { date: "2026-02-08", amount: 110.26, description: "Phone bill", category: "Phone" },
        { date: "2026-02-14", amount: 75.00, description: "Fun money", category: "Fun Money" },
        // Giving
        { date: "2026-02-01", amount: 400.00, description: "Church offering", category: "Church Offering" },
        // Funds
        { date: "2026-02-28", amount: 10454.76, description: "Transfer to savings", category: "Savings/Emergency" },
      ],
    },
    "2026-03": {
      predictedIncome: 15000,
      charityCarryover: 0,
      categoryTargets: [
        { category: "Teamworks", target: 13000 },
        { category: "Riverview/SynergenX", target: 1000 },
        { category: "Gifts/Other", target: 1000 },
        { category: "Church Offering", target: 850 },
        { category: "Charity/Other", target: 500 },
        { category: "Mortgage", target: 3993.23 },
        { category: "Water/Trash", target: 200 },
        { category: "Propane", target: 600 },
        { category: "Cable/Internet", target: 120 },
        { category: "Auto & Life", target: 48.36 },
        { category: "Gas/Parking", target: 150 },
        { category: "Groceries", target: 350 },
        { category: "Restaurants", target: 200 },
        { category: "Phone", target: 110.26 },
        { category: "Doctor Visits", target: 0 },
      ],
      transactions: [
        // Income
        { date: "2026-03-14", amount: 13221.95, description: "Teamworks paycheck", category: "Teamworks" },
        { date: "2026-03-14", amount: 1085.10, description: "Riverview/SynergenX", category: "Riverview/SynergenX" },
        { date: "2026-03-20", amount: 2516.49, description: "Gifts/Other income", category: "Gifts/Other" },
        // Housing
        { date: "2026-03-01", amount: 3993.23, description: "Mortgage payment", category: "Mortgage" },
        { date: "2026-03-10", amount: 410.97, description: "Water/Trash", category: "Water/Trash" },
        { date: "2026-03-05", amount: 567.73, description: "Propane", category: "Propane" },
        { date: "2026-03-15", amount: 120.00, description: "Cable/Internet", category: "Cable/Internet" },
        // Insurance
        { date: "2026-03-05", amount: 48.36, description: "Auto & Life Insurance", category: "Auto & Life" },
        // Food
        { date: "2026-03-07", amount: 168.44, description: "Groceries", category: "Groceries" },
        { date: "2026-03-14", amount: 185.23, description: "Groceries", category: "Groceries" },
        { date: "2026-03-21", amount: 179.11, description: "Groceries", category: "Groceries" },
        { date: "2026-03-10", amount: 89.23, description: "Restaurant", category: "Restaurants" },
        { date: "2026-03-18", amount: 122.44, description: "Restaurants", category: "Restaurants" },
        // Personal
        { date: "2026-03-08", amount: 110.26, description: "Phone bill", category: "Phone" },
        { date: "2026-03-15", amount: 200.00, description: "Fun money", category: "Fun Money" },
        // Health
        { date: "2026-03-15", amount: 447.95, description: "Doctor visit", category: "Doctor Visits" },
        // Education
        { date: "2026-03-22", amount: 23.20, description: "Education", category: "Other" },
        // Giving
        { date: "2026-03-01", amount: 400.00, description: "Church offering", category: "Church Offering" },
        // Funds
        { date: "2026-03-31", amount: 6394.03, description: "Transfer to savings", category: "Savings/Emergency" },
      ],
    },
  };

  for (const [month, data] of Object.entries(MONTHLY_DATA)) {
    // Insert monthly target
    insertMonthlyTarget.run(month, data.predictedIncome, data.charityCarryover);

    // Insert category targets
    for (const ct of data.categoryTargets) {
      const catId = catMap.get(ct.category);
      if (catId) {
        insertCatTarget.run(month, catId, ct.target);
      }
    }

    // Insert transactions
    const insertBatch = db.transaction(() => {
      for (const tx of data.transactions) {
        const catId = catMap.get(tx.category);
        if (!catId) {
          console.warn(`⚠️  Unknown category: ${tx.category}`);
          continue;
        }
        const weekLabel = getISOWeek(tx.date);
        insertTx.run(tx.date, tx.amount, tx.description, catId, weekLabel);
      }
    });
    insertBatch();

    console.log(`✅ Seeded ${month}: ${data.transactions.length} transactions`);
  }
} catch (err) {
  console.warn("⚠️  Could not seed budget data:", err);
}

// ─── Seed App Settings ─────────────────────────────────────────────────────────
const upsertSetting = db.prepare(`
  INSERT OR REPLACE INTO app_settings (key, value, updated_at)
  VALUES (?, ?, datetime('now'))
`);

const adminEmail = process.env.ADMIN_EMAIL ?? "admin@ledger.local";
const adminPassword = process.env.ADMIN_PASSWORD ?? "ledger2026";
const passwordHash = bcrypt.hashSync(adminPassword, 12);

upsertSetting.run("admin_email", adminEmail);
upsertSetting.run("admin_password_hash", passwordHash);
upsertSetting.run("default_income", "17000");
upsertSetting.run("charity_bank_start_balance", "13192.89");
upsertSetting.run("app_initialized", "true");

console.log(`✅ App settings seeded (admin: ${adminEmail} / password: ${adminPassword})`);

db.close();
console.log("\n🎉 Seed complete!");
