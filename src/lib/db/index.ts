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
