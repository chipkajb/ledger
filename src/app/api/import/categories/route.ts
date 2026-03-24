import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { budgetCategories } from "@/lib/db/schema";
import * as XLSX from "xlsx";

export const runtime = "nodejs";

/** POST /api/import/categories
 * Accepts a multipart/form-data upload with field "file" (CSV or XLSX).
 *
 * Expected columns (case-insensitive):
 *   Name | Parent Category | Is Income | Sort Order
 *
 * - Rows with an existing name+parent combination are skipped (no duplicates).
 * - "Is Income" accepts: true/false, yes/no, 1/0 (case-insensitive).
 * - "Sort Order" is optional (defaults to 0).
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

  // Build existing name+parent set to avoid duplicates
  const existing = db.select({ name: budgetCategories.name, parentCategory: budgetCategories.parentCategory }).from(budgetCategories).all();
  const existingSet = new Set(existing.map((c) => `${c.name.toLowerCase()}||${c.parentCategory.toLowerCase()}`));

  const insert = db.$client.prepare(`
    INSERT INTO budget_categories (name, parent_category, is_income_source, sort_order)
    VALUES (?, ?, ?, ?)
  `);

  let imported = 0;
  const skipped: string[] = [];

  const insertBatch = db.$client.transaction(() => {
    for (const row of rows) {
      const catName = String(findColValue(row, "name") ?? "").trim();
      if (!catName) {
        skipped.push(`Row missing name: ${JSON.stringify(row)}`);
        continue;
      }

      const parent = String(findColValue(row, "parent") ?? "").trim();
      if (!parent) {
        skipped.push(`Row "${catName}" missing parent category`);
        continue;
      }

      const key = `${catName.toLowerCase()}||${parent.toLowerCase()}`;
      if (existingSet.has(key)) {
        skipped.push(`Category "${catName}" under "${parent}" already exists`);
        continue;
      }

      const isIncomeRaw = String(findColValue(row, "income", "is_income") ?? "false").trim().toLowerCase();
      const isIncome = isIncomeRaw === "true" || isIncomeRaw === "yes" || isIncomeRaw === "1" ? 1 : 0;

      const sortOrderRaw = findColValue(row, "sort", "order");
      const sortOrder = sortOrderRaw !== undefined && sortOrderRaw !== "" ? Number(sortOrderRaw) : 0;

      insert.run(catName, parent, isIncome, isNaN(sortOrder) ? 0 : sortOrder);
      existingSet.add(key);
      imported++;
    }
  });

  insertBatch();

  return NextResponse.json({ imported, skipped: skipped.slice(0, 20), totalSkipped: skipped.length });
}

function parseFile(buf: Buffer, _filename: string): Array<Record<string, unknown>> {
  const wb = XLSX.read(buf, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error("Empty workbook");
  return XLSX.utils.sheet_to_json(sheet, { defval: "" }) as Array<Record<string, unknown>>;
}

function findColValue(row: Record<string, unknown>, ...names: string[]): unknown {
  const keys = Object.keys(row);
  for (const name of names) {
    const key = keys.find((k) => k.toLowerCase().replace(/[\s_]/g, "").includes(name.replace(/[\s_]/g, "")));
    if (key !== undefined) return row[key];
  }
  return undefined;
}
