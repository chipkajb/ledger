import {
  sqliteTable,
  text,
  real,
  integer,
  index,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// ─── Budget ───────────────────────────────────────────────────────────────────

export const budgetCategories = sqliteTable("budget_categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  parentCategory: text("parent_category").notNull(),
  budgetPct: real("budget_pct"),
  budgetAmount: real("budget_amount"),
  isIncomeSource: integer("is_income_source", { mode: "boolean" })
    .notNull()
    .default(false),
  isFunds: integer("is_funds", { mode: "boolean" }).notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  deprecated: integer("deprecated", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const transactions = sqliteTable(
  "transactions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    date: text("date").notNull(), // ISO date YYYY-MM-DD
    amount: real("amount").notNull(),
    description: text("description").notNull().default(""),
    categoryId: integer("category_id")
      .notNull()
      .references(() => budgetCategories.id),
    weekLabel: text("week_label").notNull(), // YYYY-WXX
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => ({
    dateIdx: index("transactions_date_idx").on(t.date),
    categoryIdx: index("transactions_category_idx").on(t.categoryId),
  })
);

export const budgetMonthlyTargets = sqliteTable(
  "budget_monthly_targets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    month: text("month").notNull(), // YYYY-MM
    predictedIncome: real("predicted_income").notNull().default(0),
    charityBankCarryover: real("charity_bank_carryover").notNull().default(0),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => ({
    monthIdx: index("budget_monthly_targets_month_idx").on(t.month),
  })
);

// Category-level monthly target overrides
export const budgetCategoryTargets = sqliteTable(
  "budget_category_targets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    month: text("month").notNull(), // YYYY-MM
    categoryId: integer("category_id")
      .notNull()
      .references(() => budgetCategories.id),
    targetAmount: real("target_amount").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => ({
    monthIdx: index("budget_category_targets_month_idx").on(t.month),
    categoryIdx: index("budget_category_targets_category_idx").on(t.categoryId),
  })
);

// ─── Net Worth ────────────────────────────────────────────────────────────────

export const netWorthSnapshots = sqliteTable(
  "net_worth_snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    snapshotDate: text("snapshot_date").notNull(), // ISO date YYYY-MM-DD
    // Assets
    checking: real("checking").notNull().default(0),
    savings: real("savings").notNull().default(0),
    homeEquity: real("home_equity").notNull().default(0),
    retirement401k: real("retirement_401k").notNull().default(0),
    hsaHra: real("hsa_hra").notNull().default(0),
    investments: real("investments").notNull().default(0),
    plan529: real("plan_529").notNull().default(0),
    teamworksEquity: real("teamworks_equity").notNull().default(0),
    // Liabilities
    mortgageBalance: real("mortgage_balance").notNull().default(0),
    studentLoans: real("student_loans").notNull().default(0),
    personalLoans: real("personal_loans").notNull().default(0),
    // Computed (stored for performance)
    totalAssets: real("total_assets").notNull().default(0),
    totalLiabilities: real("total_liabilities").notNull().default(0),
    netWorth: real("net_worth").notNull().default(0),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => ({
    dateIdx: index("net_worth_snapshots_date_idx").on(t.snapshotDate),
  })
);

// ─── Mortgage ─────────────────────────────────────────────────────────────────

export const mortgages = sqliteTable("mortgages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  label: text("label").notNull(),
  housePrice: real("house_price").notNull(),
  downPayment: real("down_payment").notNull(),
  loanAmount: real("loan_amount").notNull(),
  annualRate: real("annual_rate").notNull(), // decimal e.g. 0.0599
  termYears: integer("term_years").notNull().default(30),
  paymentsPerYear: integer("payments_per_year").notNull().default(12),
  firstPaymentDate: text("first_payment_date").notNull(), // YYYY-MM-DD
  monthlyEscrow: real("monthly_escrow").notNull().default(0),
  pmi: real("pmi").notNull().default(0),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(false),
  notes: text("notes"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const mortgageExtraPayments = sqliteTable(
  "mortgage_extra_payments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    mortgageId: integer("mortgage_id")
      .notNull()
      .references(() => mortgages.id, { onDelete: "cascade" }),
    paymentDate: text("payment_date").notNull(), // YYYY-MM-DD
    amount: real("amount").notNull(),
    note: text("note"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => ({
    mortgageIdx: index("mortgage_extra_payments_mortgage_idx").on(t.mortgageId),
    dateIdx: index("mortgage_extra_payments_date_idx").on(t.paymentDate),
  })
);

// ─── App Settings ─────────────────────────────────────────────────────────────

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ─── Type Exports ─────────────────────────────────────────────────────────────

export type BudgetCategory = typeof budgetCategories.$inferSelect;
export type NewBudgetCategory = typeof budgetCategories.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type BudgetMonthlyTarget = typeof budgetMonthlyTargets.$inferSelect;
export type BudgetCategoryTarget = typeof budgetCategoryTargets.$inferSelect;
export type NetWorthSnapshot = typeof netWorthSnapshots.$inferSelect;
export type NewNetWorthSnapshot = typeof netWorthSnapshots.$inferInsert;
export type Mortgage = typeof mortgages.$inferSelect;
export type NewMortgage = typeof mortgages.$inferInsert;
export type MortgageExtraPayment = typeof mortgageExtraPayments.$inferSelect;
export type NewMortgageExtraPayment =
  typeof mortgageExtraPayments.$inferInsert;
