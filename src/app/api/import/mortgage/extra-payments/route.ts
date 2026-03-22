import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { mortgages, mortgageExtraPayments } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import * as XLSX from "xlsx";
import { addDays, format } from "date-fns";

export const runtime = "nodejs";

/**
 * POST /api/import/mortgage/extra-payments
 *
 * Accepts multipart/form-data with:
 *   file: CSV or XLSX file
 *   mortgageId: (optional) ID of the mortgage to import into; defaults to active mortgage
 *
 * Expected columns (case-insensitive):
 *   Date | Amount | Note (optional)
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

  const mortgageIdRaw = formData.get("mortgageId") as string | null;

  const buffer = Buffer.from(await file.arrayBuffer());
  const name = file.name.toLowerCase();

  let rows: Array<Record<string, unknown>>;
  try {
    const wb = XLSX.read(buffer, { type: "buffer" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) throw new Error("Empty workbook");
    rows = XLSX.utils.sheet_to_json(sheet, { defval: "" }) as Array<Record<string, unknown>>;
  } catch (e) {
    return NextResponse.json(
      { error: `Could not parse file: ${e instanceof Error ? e.message : e}` },
      { status: 400 }
    );
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: "File contains no data rows" }, { status: 400 });
  }

  const db = getDb();

  // Resolve which mortgage to import into
  let targetMortgageId: number;
  if (mortgageIdRaw) {
    targetMortgageId = parseInt(mortgageIdRaw);
    const m = await db.select().from(mortgages).where(eq(mortgages.id, targetMortgageId)).get();
    if (!m) return NextResponse.json({ error: "Mortgage not found" }, { status: 404 });
  } else {
    const all = await db.select().from(mortgages);
    const active = all.find((m) => m.isActive) ?? all[0];
    if (!active) return NextResponse.json({ error: "No mortgage configured" }, { status: 404 });
    targetMortgageId = active.id;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dbRaw = db as any;
  const insertStmt = dbRaw.prepare(
    "INSERT INTO mortgage_extra_payments (mortgage_id, payment_date, amount, note) VALUES (?, ?, ?, ?)"
  );

  let imported = 0;
  const skipped: string[] = [];

  const insertBatch = dbRaw.transaction(() => {
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

      const noteRaw = findColValue(row, "note", "notes", "description", "memo");
      const note = noteRaw ? String(noteRaw).trim() || null : null;

      insertStmt.run(targetMortgageId, dateStr, amount, note);
      imported++;
    }
  });

  insertBatch();

  return NextResponse.json({
    imported,
    skipped: skipped.slice(0, 20),
    totalSkipped: skipped.length,
    mortgageId: targetMortgageId,
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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
  if (raw === undefined || raw === "") return null;
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
  }
  return null;
}

function resolveAmount(row: Record<string, unknown>): number {
  const raw = findColValue(row, "amount", "payment", "extra");
  if (raw !== undefined && raw !== "") {
    const n = parseFloat(String(raw).replace(/[$,\s()]/g, ""));
    if (!isNaN(n) && n !== 0) return Math.abs(n);
  }
  return 0;
}
