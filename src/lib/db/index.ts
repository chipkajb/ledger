import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "path";

const DB_PATH = process.env.DATABASE_URL ?? "./ledger.db";

// Resolve relative paths from the project root
const dbPath = path.isAbsolute(DB_PATH) ? DB_PATH : path.resolve(process.cwd(), DB_PATH);

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (!_db) {
    const sqlite = new Database(dbPath);
    // Enable WAL mode for better concurrent read performance
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");

    // Run additive column migrations before Drizzle touches the schema.
    // This guarantees new columns exist even if the startup seed script didn't run.
    const budgetCatCols = sqlite.pragma("table_info(budget_categories)") as Array<{ name: string }>;
    if (budgetCatCols.length > 0 && !budgetCatCols.some((c) => c.name === "deprecated")) {
      sqlite.exec("ALTER TABLE budget_categories ADD COLUMN deprecated INTEGER NOT NULL DEFAULT 0");
    }

    const nwCols = sqlite.pragma("table_info(net_worth_snapshots)") as Array<{ name: string }>;
    if (nwCols.length > 0) {
      const nwColNames = nwCols.map((c) => c.name);
      if (!nwColNames.includes("home_value"))
        sqlite.exec("ALTER TABLE net_worth_snapshots ADD COLUMN home_value REAL");
      if (!nwColNames.includes("accounts_401k_json"))
        sqlite.exec("ALTER TABLE net_worth_snapshots ADD COLUMN accounts_401k_json TEXT");
      if (!nwColNames.includes("invest_accounts_json"))
        sqlite.exec("ALTER TABLE net_worth_snapshots ADD COLUMN invest_accounts_json TEXT");
      if (!nwColNames.includes("teamworks_pools_json"))
        sqlite.exec("ALTER TABLE net_worth_snapshots ADD COLUMN teamworks_pools_json TEXT");
      if (!nwColNames.includes("teamworks_fmv"))
        sqlite.exec("ALTER TABLE net_worth_snapshots ADD COLUMN teamworks_fmv REAL");
    }

    _db = drizzle(sqlite, { schema });
  }
  return _db;
}

export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_, prop) {
    return getDb()[prop as keyof ReturnType<typeof drizzle<typeof schema>>];
  },
});

export { schema };
