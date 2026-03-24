/**
 * Seed script: imports historical data from Excel files into the SQLite database.
 * Run with: pnpm seed
 *
 * Reads from the parent directory (workspace/ledger):
 * - Budget YYYY.xlsx  (any year — scanned automatically)
 * - Mortgage.xlsx
 * - Net Worth.xlsx
 *
 * Budget YYYY.xlsx expected format per monthly sheet:
 *   Optional header rows:
 *     "Predicted Income: $XX,XXX"
 *     "Charity Bank Carryover: $XX,XXX"
 *   Then a blank row, then a table header row (Date | Category | Description | Amount)
 *   Followed by transaction rows.
 *   Alternatively: header row with any recognisable column names.
 */

import Database from "better-sqlite3";
import * as XLSX from "xlsx";
import * as bcrypt from "bcryptjs";
import * as fs from "fs";
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

/** Parse a raw cell value into an ISO date string or null */
function parseDate(raw: unknown): string | null {
  if (!raw || raw === 0) return null;
  if (typeof raw === "number" && raw > 40000) {
    return excelDateToISO(raw);
  }
  if (typeof raw === "string") {
    const s = raw.trim();
    // YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    // M/D/YYYY or MM/DD/YYYY
    if (s.includes("/")) {
      const parts = s.split("/");
      if (parts.length === 3) {
        return `${parts[2]}-${parts[0].padStart(2, "0")}-${parts[1].padStart(2, "0")}`;
      }
    }
    // M/D/YY
    if (/^\d{1,2}\/\d{1,2}\/\d{2}$/.test(s)) {
      const parts = s.split("/");
      const yr = parseInt(parts[2]);
      const fullYr = yr < 70 ? 2000 + yr : 1900 + yr;
      return `${fullYr}-${parts[0].padStart(2, "0")}-${parts[1].padStart(2, "0")}`;
    }
  }
  return null;
}

/** Parse a raw cell value to a number, stripping currency symbols */
function parseAmount(raw: unknown): number {
  if (typeof raw === "number") return raw;
  if (typeof raw === "string") {
    const n = parseFloat(raw.replace(/[$,\s]/g, ""));
    if (!isNaN(n)) return n;
  }
  return 0;
}

/** Case-insensitive column finder */
function findCol(headers: string[], ...names: string[]): number {
  const lc = headers.map((h) => h.toLowerCase().trim());
  for (const name of names) {
    const idx = lc.findIndex((h) => h.includes(name.toLowerCase()));
    if (idx !== -1) return idx;
  }
  return -1;
}

const MONTH_NAMES: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

// ─── Seed Budget Categories ────────────────────────────────────────────────────
const CATEGORIES = [
  // Income
  { name: "Teamworks", parent: "Income", isIncome: true, sort: 10 },
  { name: "Riverview", parent: "Income", isIncome: true, sort: 11 },
  { name: "Gifts/Other", parent: "Income", isIncome: true, sort: 12 },
  // Funds
  { name: "Savings/Emergency", parent: "Funds", isFunds: true, sort: 20 },
  // Giving
  { name: "Church Offering", parent: "Giving", sort: 30 },
  { name: "Charity/Other", parent: "Giving", sort: 31 },
  { name: "Hospitality", parent: "Giving", sort: 32 },
  // Housing
  { name: "Mortgage", parent: "Housing", sort: 40 },
  { name: "Water", parent: "Housing", sort: 41 },
  { name: "Trash", parent: "Housing", sort: 42 },
  { name: "Propane", parent: "Housing", sort: 43 },
  { name: "Electricity", parent: "Housing", sort: 44 },
  { name: "Cable/Internet", parent: "Housing", sort: 45 },
  { name: "Natural Gas", parent: "Housing", sort: 46 },
  // Insurance
  { name: "Auto", parent: "Insurance", sort: 50 },
  { name: "Life", parent: "Insurance", sort: 51 },
  // Transportation
  { name: "Gas", parent: "Transportation", sort: 60 },
  { name: "Parking", parent: "Transportation", sort: 61 },
  { name: "Maintenance", parent: "Transportation", sort: 62 },
  // Food
  { name: "Groceries", parent: "Food", sort: 70 },
  { name: "Restaurants", parent: "Food", sort: 71 },
  // Personal
  { name: "Clothing", parent: "Personal", sort: 80 },
  { name: "Phone", parent: "Personal", sort: 81 },
  { name: "Home Improvement", parent: "Personal", sort: 82 },
  { name: "Furniture", parent: "Personal", sort: 83 },
  { name: "Travel/Entertainment", parent: "Personal", sort: 84 },
  { name: "Fun Money / Other", parent: "Personal", sort: 85 },
  // Health
  { name: "Doctor Visits", parent: "Health", sort: 90 },
  { name: "Dog", parent: "Health", sort: 91 },
  // Debt
  { name: "Car Payment", parent: "Debt", sort: 100 },
  // Education
  { name: "Tuition", parent: "Education", sort: 110 },
];

const existingCategoryCount = (db.prepare("SELECT COUNT(*) as cnt FROM budget_categories").get() as { cnt: number }).cnt;

if (existingCategoryCount === 0) {
  const insertCategory = db.prepare(`
    INSERT INTO budget_categories (name, parent_category, is_income_source, is_funds, sort_order)
    VALUES (?, ?, ?, ?, ?)
  `);

  for (const cat of CATEGORIES) {
    insertCategory.run(
      cat.name,
      cat.parent,
      cat.isIncome ? 1 : 0,
      cat.isFunds ? 1 : 0,
      cat.sort
    );
  }
  console.log(`✅ Inserted ${CATEGORIES.length} budget categories`);
} else {
  console.log(`⏭️  Skipping categories — ${existingCategoryCount} already exist`);
}

// Get category ID map
const catRows = db.prepare("SELECT id, name FROM budget_categories").all() as Array<{id: number; name: string}>;
const catMap = new Map(catRows.map((r) => [r.name.toLowerCase(), r.id]));

// Helper: fuzzy category matching
function findCategoryId(raw: string): number | null {
  if (!raw) return null;
  const lower = raw.trim().toLowerCase();
  // Exact match
  if (catMap.has(lower)) return catMap.get(lower)!;
  // Partial match
  for (const entry of Array.from(catMap.entries())) {
    const [name, id] = entry;
    if (lower.includes(name) || name.includes(lower)) return id;
  }
  return null;
}

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

  const colDate = 0;
  const colChecking = findCol(headers, "Checking");
  const colSavings = findCol(headers, "Savings");
  const colHomeEquity = findCol(headers, "Home Equity", "HomeEquity");
  const col401k = findCol(headers, "401K", "401k", "Retirement");
  const colHsa = findCol(headers, "HSA", "HRA");
  const colInvestments = findCol(headers, "Investment");
  const col529 = findCol(headers, "529");
  const colTeamworks = findCol(headers, "Teamworks");
  const colMortgage = findCol(headers, "Mortgage");
  const colStudentLoans = findCol(headers, "Student");
  const colPersonalLoans = findCol(headers, "Personal Loan", "PersonalLoan");

  let insertedCount = 0;
  const insertBatch = db.transaction((dataRows: Array<Array<number | string>>) => {
    for (const row of dataRows) {
      const rawDate = row[colDate];
      if (!rawDate || rawDate === 0 || rawDate === "Date") continue;

      const dateStr = parseDate(rawDate);
      if (!dateStr) continue;

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
  "Example Mortgage",
  400000, 80000, 320000, 0.065, 30, 12,
  "2024-01-01", 400.00, 0, 0,
  "Example original loan at 6.5%"
);

const m2 = insertMortgage.run(
  "Example Refinance",
  400000, 85000, 315000, 0.055, 30, 12,
  "2025-01-01", 400.00, 0, 1,
  "Example refinance at 5.5%"
);

const m1Id = m1.lastInsertRowid as number;

// Example extra payments
const insertExtra = db.prepare(`
  INSERT INTO mortgage_extra_payments (mortgage_id, payment_date, amount, note)
  VALUES (?, ?, ?, ?)
`);
insertExtra.run(m1Id, "2024-06-01", 500, "Example extra payment");
insertExtra.run(m1Id, "2024-07-01", 500, "Example extra payment");
insertExtra.run(m1Id, "2024-08-01", 500, "Example extra payment");

console.log("✅ Inserted 2 mortgages + 3 extra payments");

// ─── Parse a Budget YYYY.xlsx file ─────────────────────────────────────────────

interface ParsedTransaction {
  date: string;
  amount: number;
  description: string;
  category: string;
}

interface ParsedMonthData {
  month: string; // YYYY-MM
  predictedIncome: number;
  charityCarryover: number;
  transactions: ParsedTransaction[];
  categoryTargets: Array<{ category: string; target: number }>;
}

/**
 * Parse a single monthly sheet from a Budget xlsx workbook.
 * Tries to auto-detect the header row and column layout.
 */
function parseMonthSheet(
  sheet: XLSX.WorkSheet,
  year: number,
  monthNum: number
): ParsedMonthData {
  const monthStr = `${year}-${String(monthNum).padStart(2, "0")}`;

  const rows = (XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
  }) as unknown) as Array<Array<string | number>>;

  let predictedIncome = 0;
  let charityCarryover = 0;
  const transactions: ParsedTransaction[] = [];
  const categoryTargets: Array<{ category: string; target: number }> = [];

  // Scan early rows for metadata (Predicted Income, Charity Carryover)
  for (let i = 0; i < Math.min(20, rows.length); i++) {
    const row = rows[i];
    const rowText = row.map((c) => String(c)).join(" ").toLowerCase();
    if (rowText.includes("predicted income") || rowText.includes("expected income")) {
      for (const cell of row) {
        const n = parseAmount(cell);
        if (n > 0) { predictedIncome = n; break; }
      }
    }
    if (rowText.includes("charity") && (rowText.includes("carryover") || rowText.includes("carry"))) {
      for (const cell of row) {
        const n = parseAmount(cell);
        if (n > 0) { charityCarryover = n; break; }
      }
    }
  }

  // Find the transaction header row: must contain "date" and either "amount" or "debit/credit"
  let headerRowIdx = -1;
  let colDate = -1, colAmount = -1, colDebit = -1, colCredit = -1;
  let colDescription = -1, colCategory = -1, colTarget = -1;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const headers = row.map((c) => String(c).toLowerCase().trim());
    const dateIdx = headers.findIndex((h) => h === "date" || h.includes("date"));
    if (dateIdx === -1) continue;
    // Also need at least one of: amount, debit, credit, payment
    const amtIdx = headers.findIndex((h) =>
      h === "amount" || h.includes("amount") || h === "payment" || h.includes("payment")
    );
    const debitIdx = headers.findIndex((h) => h === "debit" || h.includes("debit"));
    const creditIdx = headers.findIndex((h) => h === "credit" || h.includes("credit"));

    if (amtIdx !== -1 || debitIdx !== -1 || creditIdx !== -1) {
      headerRowIdx = i;
      colDate = dateIdx;
      colAmount = amtIdx;
      colDebit = debitIdx;
      colCredit = creditIdx;
      colDescription = headers.findIndex((h) =>
        h === "description" || h === "note" || h === "memo" ||
        h.includes("description") || h.includes("note") || h.includes("memo")
      );
      colCategory = headers.findIndex((h) =>
        h === "category" || h.includes("category")
      );
      colTarget = headers.findIndex((h) =>
        h === "target" || h === "budget" || h.includes("target") || h.includes("budget")
      );
      break;
    }
  }

  if (headerRowIdx === -1) {
    // No recognizable header found — return empty data
    return { month: monthStr, predictedIncome, charityCarryover, transactions, categoryTargets };
  }

  // Parse data rows
  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c) => !c && c !== 0)) continue;

    const rawDate = colDate >= 0 ? row[colDate] : null;
    const dateStr = parseDate(rawDate);

    // If no date but we have category + target, treat as category target row
    if (!dateStr) {
      if (colCategory >= 0 && colTarget >= 0) {
        const cat = String(row[colCategory] ?? "").trim();
        const tgt = parseAmount(row[colTarget]);
        if (cat && tgt > 0) {
          categoryTargets.push({ category: cat, target: tgt });
        }
      }
      continue;
    }

    // Determine amount
    let amount = 0;
    if (colAmount >= 0) {
      amount = Math.abs(parseAmount(row[colAmount]));
    } else if (colDebit >= 0 || colCredit >= 0) {
      const debit = colDebit >= 0 ? parseAmount(row[colDebit]) : 0;
      const credit = colCredit >= 0 ? parseAmount(row[colCredit]) : 0;
      amount = Math.abs(debit || credit);
    }
    if (amount === 0) continue;

    const description = colDescription >= 0 ? String(row[colDescription] ?? "").trim() : "";
    const category = colCategory >= 0 ? String(row[colCategory] ?? "").trim() : "";

    transactions.push({ date: dateStr, amount, description, category });
  }

  return { month: monthStr, predictedIncome, charityCarryover, transactions, categoryTargets };
}

/**
 * Discover and parse all "Budget YYYY.xlsx" files in XLSX_BASE.
 * Returns parsed data sorted by year (oldest first).
 */
function findBudgetFiles(): Array<{ year: number; filePath: string }> {
  const files: Array<{ year: number; filePath: string }> = [];
  try {
    const entries = fs.readdirSync(XLSX_BASE);
    for (const entry of entries) {
      const m = entry.match(/^Budget\s+(\d{4})\.xlsx$/i);
      if (m) {
        files.push({ year: parseInt(m[1]), filePath: path.join(XLSX_BASE, entry) });
      }
    }
  } catch {
    // directory not readable
  }
  return files.sort((a, b) => a.year - b.year);
}

// ─── Seed Budget Data from all Budget YYYY.xlsx files ─────────────────────────

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

const budgetFiles = findBudgetFiles();

if (budgetFiles.length > 0) {
  console.log(`📂 Found ${budgetFiles.length} Budget xlsx file(s): ${budgetFiles.map(f => path.basename(f.filePath)).join(", ")}`);

  for (const { year, filePath } of budgetFiles) {
    try {
      const wb = XLSX.readFile(filePath);

      for (const sheetName of wb.SheetNames) {
        const monthNum = MONTH_NAMES[sheetName.toLowerCase()];
        if (!monthNum) continue; // skip non-month sheets

        const sheet = wb.Sheets[sheetName];
        if (!sheet) continue;

        const parsed = parseMonthSheet(sheet, year, monthNum);

        // Insert monthly target
        insertMonthlyTarget.run(parsed.month, parsed.predictedIncome, parsed.charityCarryover);

        // Insert category targets
        for (const ct of parsed.categoryTargets) {
          const catId = findCategoryId(ct.category);
          if (catId) insertCatTarget.run(parsed.month, catId, ct.target);
        }

        // Insert transactions
        let txCount = 0;
        const insertBatch = db.transaction(() => {
          for (const tx of parsed.transactions) {
            const catId = tx.category ? findCategoryId(tx.category) : null;
            if (!catId) {
              console.warn(`    ⚠️  Unknown category "${tx.category}" for transaction on ${tx.date}`);
              continue;
            }
            const weekLabel = getISOWeek(tx.date);
            insertTx.run(tx.date, tx.amount, tx.description, catId, weekLabel);
            txCount++;
          }
        });
        insertBatch();

        console.log(`  ✅ ${year}/${sheetName}: ${txCount} transactions, ${parsed.categoryTargets.length} targets`);
      }
    } catch (err) {
      console.warn(`⚠️  Could not parse ${path.basename(filePath)}:`, err);
    }
  }
} else {
  console.log("📂 No Budget YYYY.xlsx files found — seeding with built-in sample data for 2026");
  seedFallback2026Data();
}

// ─── Fallback: built-in 2026 sample data ──────────────────────────────────────
function seedFallback2026Data() {
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
        { date: "2026-01-15", amount: 8992.96, description: "Teamworks paycheck", category: "Teamworks" },
        { date: "2026-01-15", amount: 4031.83, description: "Riverview/SynergenX", category: "Riverview/SynergenX" },
        { date: "2026-01-20", amount: 4026.98, description: "Gifts/Other income", category: "Gifts/Other" },
        { date: "2026-01-01", amount: 3993.23, description: "Mortgage payment", category: "Mortgage" },
        { date: "2026-01-15", amount: 635.78, description: "Water/Trash", category: "Water/Trash" },
        { date: "2026-01-20", amount: 120.00, description: "Cable/Internet", category: "Cable/Internet" },
        { date: "2026-01-05", amount: 64.38, description: "Auto & Life Insurance", category: "Auto & Life" },
        { date: "2026-01-10", amount: 46.18, description: "Gas", category: "Gas/Parking" },
        { date: "2026-01-07", amount: 198.45, description: "Groceries", category: "Groceries" },
        { date: "2026-01-14", amount: 196.51, description: "Groceries", category: "Groceries" },
        { date: "2026-01-21", amount: 201.85, description: "Groceries - HEB", category: "Groceries" },
        { date: "2026-01-10", amount: 87.42, description: "Restaurant", category: "Restaurants" },
        { date: "2026-01-17", amount: 156.88, description: "Restaurants", category: "Restaurants" },
        { date: "2026-01-24", amount: 260.63, description: "Restaurants", category: "Restaurants" },
        { date: "2026-01-12", amount: 124.65, description: "Clothing", category: "Clothing" },
        { date: "2026-01-08", amount: 438.38, description: "Phone bill", category: "Phone" },
        { date: "2026-01-15", amount: 36.88, description: "Home improvement", category: "Home Improvement" },
        { date: "2026-01-20", amount: 249.52, description: "Fun money", category: "Fun Money" },
        { date: "2026-01-22", amount: 130.00, description: "Doctor visit", category: "Doctor Visits" },
        { date: "2026-01-04", amount: 400.00, description: "Church offering", category: "Church Offering" },
        { date: "2026-01-11", amount: 192.03, description: "Charity", category: "Charity/Other" },
        { date: "2026-01-31", amount: 10312.88, description: "Transfer to savings", category: "Savings/Emergency" },
      ],
    },
    "2026-02": {
      predictedIncome: 17000,
      charityCarryover: 0,
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
        { date: "2026-02-14", amount: 8992.96, description: "Teamworks paycheck", category: "Teamworks" },
        { date: "2026-02-14", amount: 4031.83, description: "Riverview/SynergenX", category: "Riverview/SynergenX" },
        { date: "2026-02-20", amount: 4026.98, description: "Gifts/Other income", category: "Gifts/Other" },
        { date: "2026-02-01", amount: 3993.23, description: "Mortgage payment", category: "Mortgage" },
        { date: "2026-02-10", amount: 180.00, description: "Water/Trash", category: "Water/Trash" },
        { date: "2026-02-15", amount: 120.00, description: "Cable/Internet", category: "Cable/Internet" },
        { date: "2026-02-05", amount: 48.36, description: "Auto & Life Insurance", category: "Auto & Life" },
        { date: "2026-02-07", amount: 180.22, description: "Groceries", category: "Groceries" },
        { date: "2026-02-14", amount: 205.33, description: "Groceries", category: "Groceries" },
        { date: "2026-02-21", amount: 190.88, description: "Groceries", category: "Groceries" },
        { date: "2026-02-08", amount: 95.77, description: "Restaurant", category: "Restaurants" },
        { date: "2026-02-15", amount: 145.62, description: "Restaurants", category: "Restaurants" },
        { date: "2026-02-08", amount: 110.26, description: "Phone bill", category: "Phone" },
        { date: "2026-02-14", amount: 75.00, description: "Fun money", category: "Fun Money" },
        { date: "2026-02-01", amount: 400.00, description: "Church offering", category: "Church Offering" },
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
        { date: "2026-03-14", amount: 13221.95, description: "Teamworks paycheck", category: "Teamworks" },
        { date: "2026-03-14", amount: 1085.10, description: "Riverview/SynergenX", category: "Riverview/SynergenX" },
        { date: "2026-03-20", amount: 2516.49, description: "Gifts/Other income", category: "Gifts/Other" },
        { date: "2026-03-01", amount: 3993.23, description: "Mortgage payment", category: "Mortgage" },
        { date: "2026-03-10", amount: 410.97, description: "Water/Trash", category: "Water/Trash" },
        { date: "2026-03-05", amount: 567.73, description: "Propane", category: "Propane" },
        { date: "2026-03-15", amount: 120.00, description: "Cable/Internet", category: "Cable/Internet" },
        { date: "2026-03-05", amount: 48.36, description: "Auto & Life Insurance", category: "Auto & Life" },
        { date: "2026-03-07", amount: 168.44, description: "Groceries", category: "Groceries" },
        { date: "2026-03-14", amount: 185.23, description: "Groceries", category: "Groceries" },
        { date: "2026-03-21", amount: 179.11, description: "Groceries", category: "Groceries" },
        { date: "2026-03-10", amount: 89.23, description: "Restaurant", category: "Restaurants" },
        { date: "2026-03-18", amount: 122.44, description: "Restaurants", category: "Restaurants" },
        { date: "2026-03-08", amount: 110.26, description: "Phone bill", category: "Phone" },
        { date: "2026-03-15", amount: 200.00, description: "Fun money", category: "Fun Money" },
        { date: "2026-03-15", amount: 447.95, description: "Doctor visit", category: "Doctor Visits" },
        { date: "2026-03-22", amount: 23.20, description: "Education", category: "Other" },
        { date: "2026-03-01", amount: 400.00, description: "Church offering", category: "Church Offering" },
        { date: "2026-03-31", amount: 6394.03, description: "Transfer to savings", category: "Savings/Emergency" },
      ],
    },
  };

  for (const [month, data] of Object.entries(MONTHLY_DATA)) {
    insertMonthlyTarget.run(month, data.predictedIncome, data.charityCarryover);

    for (const ct of data.categoryTargets) {
      const catId = findCategoryId(ct.category);
      if (catId) insertCatTarget.run(month, catId, ct.target);
    }

    const insertBatch = db.transaction(() => {
      for (const tx of data.transactions) {
        const catId = findCategoryId(tx.category);
        if (!catId) {
          console.warn(`  ⚠️  Unknown category: ${tx.category}`);
          continue;
        }
        const weekLabel = getISOWeek(tx.date);
        insertTx.run(tx.date, tx.amount, tx.description, catId, weekLabel);
      }
    });
    insertBatch();

    console.log(`  ✅ Seeded ${month}: ${data.transactions.length} transactions`);
  }
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

console.log(`✅ App settings seeded (admin: ${adminEmail})`);

db.close();
console.log("\n🎉 Seed complete!");
