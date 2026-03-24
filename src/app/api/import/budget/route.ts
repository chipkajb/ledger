import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { budgetCategories } from "@/lib/db/schema";
import { format, addDays, getISOWeek, getISOWeekYear, parseISO } from "date-fns";
import * as XLSX from "xlsx";

export const runtime = "nodejs";

/**
 * POST /api/import/budget
 * Accepts multipart/form-data with field "file" (Budget YYYY.xlsx or CSV).
 *
 * For XLSX: expects sheets named by month (January, February, …).
 * Each sheet may contain:
 *   - Metadata rows: "Predicted Income: $X" and "Charity Bank Carryover: $X"
 *   - A transaction table with columns: Date | Category | Description | Amount
 *   - Optional target rows (no date, but has Category + Target/Budget column)
 *
 * For CSV: flat file with columns Date, Category, Description, Amount
 *   (all treated as transactions, no targets imported)
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
  const filename = file.name;

  // Try to extract year from filename
  const yearMatch = filename.match(/(\d{4})/);
  const fileYear = yearMatch ? parseInt(yearMatch[1]) : new Date().getFullYear();

  const db = getDb();
  const cats = db.select({ id: budgetCategories.id, name: budgetCategories.name }).from(budgetCategories).all();
  const catMap = new Map(cats.map((c) => [c.name.toLowerCase(), c.id]));

  function findCatId(raw: string): number | null {
    if (!raw) return null;
    const lc = raw.trim().toLowerCase();
    if (catMap.has(lc)) return catMap.get(lc)!;
    for (const [n, id] of Array.from(catMap)) {
      if (lc.includes(n) || n.includes(lc)) return id;
    }
    return null;
  }

  const wb = XLSX.read(buffer, { type: "buffer" });

  const MONTH_NAMES: Record<string, number> = {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  };

  const insertTx = db.$client.prepare(`
    INSERT INTO transactions (date, amount, description, category_id, week_label)
    VALUES (?, ?, ?, ?, ?)
  `);
  const upsertMonthlyTarget = db.$client.prepare(`
    INSERT OR REPLACE INTO budget_monthly_targets (month, predicted_income, charity_bank_carryover)
    VALUES (?, ?, ?)
  `);
  const upsertCatTarget = db.$client.prepare(`
    INSERT OR REPLACE INTO budget_category_targets (month, category_id, target_amount)
    VALUES (?, ?, ?)
  `);

  let totalTx = 0;
  let totalTargets = 0;
  const monthsImported: string[] = [];
  const skipped: string[] = [];

  const doImport = db.$client.transaction(() => {
    for (const sheetName of wb.SheetNames) {
      const monthNum = MONTH_NAMES[sheetName.toLowerCase()];
      const isFlat = !monthNum && sheetName.toLowerCase() !== "summary";

      if (!monthNum && !isFlat) continue;

      const sheet = wb.Sheets[sheetName];
      if (!sheet) continue;

      const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as Array<Array<unknown>>;

      if (monthNum) {
        // Monthly sheet
        const monthStr = `${fileYear}-${String(monthNum).padStart(2, "0")}`;
        let predictedIncome = 0;
        let charityCarryover = 0;
        const monthTxs: Array<{ date: string; amount: number; description: string; catId: number }> = [];
        const catTargets: Array<{ catId: number; target: number }> = [];

        // Scan for metadata in first 20 rows
        for (let i = 0; i < Math.min(20, rawRows.length); i++) {
          const rowText = rawRows[i].map((c) => String(c)).join(" ").toLowerCase();
          if (rowText.includes("predicted income") || rowText.includes("expected income")) {
            for (const cell of rawRows[i]) {
              const n = parseAmt(cell);
              if (n > 0) { predictedIncome = n; break; }
            }
          }
          if (rowText.includes("charity") && (rowText.includes("carryover") || rowText.includes("carry"))) {
            for (const cell of rawRows[i]) {
              const n = parseAmt(cell);
              if (n > 0) { charityCarryover = n; break; }
            }
          }
        }

        // Find transaction header row
        let headerIdx = -1;
        let colDate = -1, colAmt = -1, colDebit = -1, colCredit = -1;
        let colDesc = -1, colCat = -1, colTarget = -1;

        for (let i = 0; i < rawRows.length; i++) {
          const headers = rawRows[i].map((c) => String(c).toLowerCase().trim());
          const di = headers.findIndex((h) => h === "date" || h.startsWith("date"));
          if (di === -1) continue;
          const ai = headers.findIndex((h) => h.includes("amount") || h.includes("payment"));
          const dbi = headers.findIndex((h) => h.includes("debit"));
          const cri = headers.findIndex((h) => h.includes("credit"));
          if (ai !== -1 || dbi !== -1 || cri !== -1) {
            headerIdx = i;
            colDate = di;
            colAmt = ai;
            colDebit = dbi;
            colCredit = cri;
            colDesc = headers.findIndex((h) => h.includes("description") || h.includes("note") || h.includes("memo"));
            colCat = headers.findIndex((h) => h.includes("category") || h === "cat");
            colTarget = headers.findIndex((h) => h.includes("target") || h.includes("budget"));
            break;
          }
        }

        if (headerIdx !== -1) {
          for (let i = headerIdx + 1; i < rawRows.length; i++) {
            const row = rawRows[i];
            if (!row || row.every((c) => c === "" || c === 0)) continue;

            const rawDate = colDate >= 0 ? row[colDate] : null;
            const dateStr = parseRawDate(rawDate, fileYear);

            if (!dateStr) {
              // Maybe a category target row
              if (colCat >= 0 && colTarget >= 0) {
                const cat = String(row[colCat] ?? "").trim();
                const tgt = parseAmt(row[colTarget]);
                if (cat && tgt > 0) {
                  const catId = findCatId(cat);
                  if (catId) catTargets.push({ catId, target: tgt });
                }
              }
              continue;
            }

            let amount = 0;
            if (colAmt >= 0) {
              amount = Math.abs(parseAmt(row[colAmt]));
            } else {
              const d = colDebit >= 0 ? parseAmt(row[colDebit]) : 0;
              const c = colCredit >= 0 ? parseAmt(row[colCredit]) : 0;
              amount = Math.abs(d || c);
            }
            if (amount === 0) continue;

            const catRaw = colCat >= 0 ? String(row[colCat] ?? "").trim() : "";
            const catId = findCatId(catRaw);
            if (!catId) {
              skipped.push(`${monthStr}: unknown category "${catRaw}" on ${dateStr}`);
              continue;
            }

            const desc = colDesc >= 0 ? String(row[colDesc] ?? "").trim() : "";
            monthTxs.push({ date: dateStr, amount, description: desc, catId });
          }
        }

        // Persist
        upsertMonthlyTarget.run(monthStr, predictedIncome, charityCarryover);
        for (const ct of catTargets) {
          upsertCatTarget.run(monthStr, ct.catId, ct.target);
          totalTargets++;
        }
        for (const tx of monthTxs) {
          const weekLabel = isoWeekLabel(tx.date);
          insertTx.run(tx.date, tx.amount, tx.description, tx.catId, weekLabel);
          totalTx++;
        }
        monthsImported.push(monthStr);
      } else {
        // Flat CSV-like sheet: just import transactions
        const jsonRows = XLSX.utils.sheet_to_json(sheet, { defval: "" }) as Array<Record<string, unknown>>;
        for (const row of jsonRows) {
          const dateStr = parseRawDateFromObj(row);
          if (!dateStr) continue;
          const amount = resolveAmt(row);
          if (!amount) continue;
          const catRaw = findVal(row, "category", "cat") ?? "";
          const catId = findCatId(String(catRaw));
          if (!catId) { skipped.push(`Unknown category "${catRaw}" on ${dateStr}`); continue; }
          const desc = String(findVal(row, "description", "desc", "note", "memo") ?? "").trim();
          const weekLabel = isoWeekLabel(dateStr);
          insertTx.run(dateStr, amount, desc, catId, weekLabel);
          totalTx++;
        }
      }
    }
  });

  try {
    doImport();
  } catch (e) {
    return NextResponse.json({ error: `Import failed: ${e instanceof Error ? e.message : e}` }, { status: 500 });
  }

  return NextResponse.json({
    imported: totalTx,
    targetsImported: totalTargets,
    monthsImported,
    skipped: skipped.slice(0, 30),
    totalSkipped: skipped.length,
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseAmt(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/[$,\s()]/g, ""));
    if (!isNaN(n)) return n;
  }
  return 0;
}

function parseRawDate(raw: unknown, fallbackYear?: number): string | null {
  if (!raw && raw !== 0) return null;
  if (typeof raw === "number" && raw > 40000) {
    const d = addDays(new Date(1899, 11, 30), raw);
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
      if (parts.length === 2 && fallbackYear) {
        // M/D without year
        return `${fallbackYear}-${parts[0].padStart(2, "0")}-${parts[1].padStart(2, "0")}`;
      }
    }
  }
  return null;
}

function parseRawDateFromObj(row: Record<string, unknown>): string | null {
  const raw = findVal(row, "date");
  return raw !== undefined ? parseRawDate(raw) : null;
}

function findVal(row: Record<string, unknown>, ...names: string[]): unknown {
  const keys = Object.keys(row);
  for (const name of names) {
    const key = keys.find((k) => k.toLowerCase().includes(name));
    if (key !== undefined) return row[key];
  }
  return undefined;
}

function resolveAmt(row: Record<string, unknown>): number {
  const amt = findVal(row, "amount", "payment");
  if (amt !== undefined && amt !== "") {
    const n = parseFloat(String(amt).replace(/[$,\s()]/g, ""));
    if (!isNaN(n) && n !== 0) return Math.abs(n);
  }
  const debit = parseFloat(String(findVal(row, "debit") ?? "").replace(/[$,\s]/g, ""));
  const credit = parseFloat(String(findVal(row, "credit") ?? "").replace(/[$,\s]/g, ""));
  if (!isNaN(debit) && debit > 0) return debit;
  if (!isNaN(credit) && credit > 0) return credit;
  return 0;
}

function isoWeekLabel(dateStr: string): string {
  const d = parseISO(dateStr);
  const week = getISOWeek(d);
  const year = getISOWeekYear(d);
  return `${year}-W${String(week).padStart(2, "0")}`;
}
