import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDb } from "@/lib/db";

import { format, addDays } from "date-fns";
import * as XLSX from "xlsx";

export const runtime = "nodejs";

/**
 * POST /api/import/net-worth
 * Accepts multipart/form-data with field "file" (CSV or XLSX).
 *
 * Expected columns (case-insensitive):
 *   Date, Checking, Savings, Home Equity, 401K (or Retirement), HSA/HRA,
 *   Investments, 529 Plan (or 529), Teamworks (or Teamworks Equity),
 *   Mortgage Balance (or Mortgage), Student Loans, Personal Loans
 *
 * Total Assets, Total Liabilities, Net Worth are computed automatically.
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

  let dataRows: Array<Record<string, unknown>>;
  try {
    const wb = XLSX.read(buffer, { type: "buffer" });
    // Prefer "Data" sheet if it exists
    const sheetName = wb.SheetNames.find((n) => n.toLowerCase() === "data") ?? wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];
    if (!sheet) throw new Error("Empty workbook");
    dataRows = XLSX.utils.sheet_to_json(sheet, { defval: 0 }) as Array<Record<string, unknown>>;
  } catch (e) {
    return NextResponse.json({ error: `Could not parse file: ${e instanceof Error ? e.message : e}` }, { status: 400 });
  }

  if (dataRows.length === 0) {
    return NextResponse.json({ error: "File contains no data rows" }, { status: 400 });
  }

  const db = getDb();
  const insertSnap = db.$client.prepare(`
    INSERT OR IGNORE INTO net_worth_snapshots
    (snapshot_date, checking, savings, home_equity, retirement_401k, hsa_hra,
     investments, plan_529, teamworks_equity, mortgage_balance, student_loans,
     personal_loans, total_assets, total_liabilities, net_worth)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let imported = 0;
  const skipped: string[] = [];

  const insertBatch = db.$client.transaction(() => {
    for (const row of dataRows) {
      const rawDate = findCol(row, "date");
      const dateStr = parseRawDate(rawDate);
      if (!dateStr) {
        skipped.push(`Row missing/invalid date: ${JSON.stringify(row)}`);
        continue;
      }

      const checking = getNum(row, "checking");
      const savings = getNum(row, "savings");
      const homeEquity = getNum(row, "home equity", "homeequity", "equity");
      const retirement401k = getNum(row, "401k", "retirement", "401");
      const hsaHra = getNum(row, "hsa", "hra");
      const investments = getNum(row, "investment");
      const plan529 = getNum(row, "529");
      const teamworksEquity = getNum(row, "teamworks");
      const mortgageBalance = getNum(row, "mortgage");
      const studentLoans = getNum(row, "student");
      const personalLoans = getNum(row, "personal loan", "personalloan");

      const totalAssets = checking + savings + homeEquity + retirement401k + hsaHra + investments + plan529 + teamworksEquity;
      const totalLiabilities = mortgageBalance + studentLoans + personalLoans;
      const netWorth = totalAssets - totalLiabilities;

      insertSnap.run(
        dateStr, checking, savings, homeEquity, retirement401k, hsaHra,
        investments, plan529, teamworksEquity, mortgageBalance, studentLoans,
        personalLoans, totalAssets, totalLiabilities, netWorth
      );
      imported++;
    }
  });

  insertBatch();

  return NextResponse.json({ imported, skipped: skipped.slice(0, 20), totalSkipped: skipped.length });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function findCol(row: Record<string, unknown>, ...names: string[]): unknown {
  const keys = Object.keys(row);
  for (const name of names) {
    const key = keys.find((k) => k.toLowerCase().includes(name.toLowerCase()));
    if (key !== undefined) return row[key];
  }
  return undefined;
}

function getNum(row: Record<string, unknown>, ...names: string[]): number {
  const val = findCol(row, ...names);
  if (val === undefined || val === null || val === "") return 0;
  const n = parseFloat(String(val).replace(/[$,\s()]/g, ""));
  return isNaN(n) ? 0 : Math.abs(n);
}

function parseRawDate(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === 0 || raw === "") return null;
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
