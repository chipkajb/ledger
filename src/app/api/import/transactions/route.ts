import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { transactions, budgetCategories } from "@/lib/db/schema";
import { getISOWeekYear, getISOWeek, parseISO, format, addDays } from "date-fns";
import * as XLSX from "xlsx";

export const runtime = "nodejs";

/** POST /api/import/transactions
 * Accepts a multipart/form-data upload with field "file" (CSV or XLSX).
 *
 * Expected columns (case-insensitive, order-flexible):
 *   Date | Category | Description | Amount
 *
 * Also handles:
 *   Date | Debit | Credit | Description | Category
 *   Date | Payment | Description | Category
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart form data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const name = file.name.toLowerCase();

  let rows: Array<Record<string, unknown>>;
  try {
    rows = parseFile(buffer, name);
  } catch (e) {
    return NextResponse.json({ error: `Could not parse file: ${e instanceof Error ? e.message : e}` }, { status: 400 });
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: "File contains no data rows" }, { status: 400 });
  }

  const db = getDb();
  const cats = db.select({ id: budgetCategories.id, name: budgetCategories.name }).from(budgetCategories).all();
  const catMap = new Map(cats.map((c) => [c.name.toLowerCase(), c.id]));

  function findCatId(raw: string): number | null {
    if (!raw) return null;
    const lc = raw.trim().toLowerCase();
    if (catMap.has(lc)) return catMap.get(lc)!;
    for (const [n, id] of catMap) {
      if (lc.includes(n) || n.includes(lc)) return id;
    }
    return null;
  }

  const insertTx = db.prepare(`
    INSERT INTO transactions (date, amount, description, category_id, week_label)
    VALUES (?, ?, ?, ?, ?)
  `);

  let imported = 0;
  const skipped: string[] = [];

  const insertBatch = db.transaction(() => {
    for (const row of rows) {
      const dateStr = resolveDate(row);
      if (!dateStr) {
        skipped.push(`Row missing/invalid date: ${JSON.stringify(row)}`);
        continue;
      }

      const amount = resolveAmount(row);
      if (!amount || amount <= 0) {
        skipped.push(`Row missing/zero amount on ${dateStr}`);
        continue;
      }

      const catRaw = findColValue(row, "category", "cat");
      const catId = findCatId(String(catRaw ?? ""));
      if (!catId) {
        skipped.push(`Unknown category "${catRaw}" on ${dateStr}`);
        continue;
      }

      const description = String(findColValue(row, "description", "desc", "memo", "note") ?? "").trim();
      const weekLabel = isoWeekLabel(dateStr);

      insertTx.run(dateStr, amount, description, catId, weekLabel);
      imported++;
    }
  });

  insertBatch();

  return NextResponse.json({ imported, skipped: skipped.slice(0, 20), totalSkipped: skipped.length });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseFile(buf: Buffer, filename: string): Array<Record<string, unknown>> {
  const wb = XLSX.read(buf, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error("Empty workbook");
  return XLSX.utils.sheet_to_json(sheet, { defval: "" }) as Array<Record<string, unknown>>;
}

function findColValue(row: Record<string, unknown>, ...names: string[]): unknown {
  const keys = Object.keys(row);
  for (const name of names) {
    const key = keys.find((k) => k.toLowerCase().includes(name));
    if (key !== undefined) return row[key];
  }
  return undefined;
}

function resolveDate(row: Record<string, unknown>): string | null {
  const raw = findColValue(row, "date");
  if (!raw && raw !== 0) return null;
  return parseRawDate(raw);
}

function parseRawDate(raw: unknown): string | null {
  if (typeof raw === "number" && raw > 40000) {
    const epoch = new Date(1899, 11, 30);
    const d = addDays(epoch, raw);
    return format(d, "yyyy-MM-dd");
  }
  if (typeof raw === "string") {
    const s = raw.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    if (s.includes("/")) {
      const parts = s.split("/");
      if (parts.length === 3) {
        const yr = parseInt(parts[2]);
        const fullYr = yr < 100 ? (yr < 70 ? 2000 + yr : 1900 + yr) : yr;
        return `${fullYr}-${parts[0].padStart(2, "0")}-${parts[1].padStart(2, "0")}`;
      }
    }
    if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(s)) {
      const parts = s.split("-");
      return `${parts[2]}-${parts[0].padStart(2, "0")}-${parts[1].padStart(2, "0")}`;
    }
  }
  return null;
}

function resolveAmount(row: Record<string, unknown>): number {
  // Try "Amount" first
  const amt = findColValue(row, "amount", "payment");
  if (amt !== undefined && amt !== "") {
    const n = parseFloat(String(amt).replace(/[$,\s()]/g, ""));
    if (!isNaN(n) && n !== 0) return Math.abs(n);
  }
  // Try debit/credit
  const debit = findColValue(row, "debit");
  const credit = findColValue(row, "credit");
  const d = parseFloat(String(debit ?? "").replace(/[$,\s]/g, ""));
  const c = parseFloat(String(credit ?? "").replace(/[$,\s]/g, ""));
  if (!isNaN(d) && d > 0) return d;
  if (!isNaN(c) && c > 0) return c;
  return 0;
}

function isoWeekLabel(dateStr: string): string {
  const d = parseISO(dateStr);
  const week = getISOWeek(d);
  const year = getISOWeekYear(d);
  return `${year}-W${String(week).padStart(2, "0")}`;
}
