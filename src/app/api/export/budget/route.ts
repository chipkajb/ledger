import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { transactions, budgetCategories, budgetMonthlyTargets, budgetCategoryTargets } from "@/lib/db/schema";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import * as XLSX from "xlsx";

export const runtime = "nodejs";

/**
 * Export a full budget year as a multi-sheet XLSX or a flat CSV.
 * GET /api/export/budget?year=2026&format=xlsx
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const fmt = searchParams.get("format") ?? "xlsx";
  const year = searchParams.get("year") ?? String(new Date().getFullYear());

  const db = getDb();

  // Fetch all categories
  const cats = db.select().from(budgetCategories).orderBy(budgetCategories.sortOrder).all();
  const catById = new Map(cats.map((c) => [c.id, c]));

  // Fetch all transactions for the year
  const txRows = db
    .select({
      id: transactions.id,
      date: transactions.date,
      amount: transactions.amount,
      description: transactions.description,
      weekLabel: transactions.weekLabel,
      categoryId: transactions.categoryId,
    })
    .from(transactions)
    .where(and(gte(transactions.date, `${year}-01-01`), lte(transactions.date, `${year}-12-31`)))
    .orderBy(desc(transactions.date))
    .all();

  // Fetch all monthly targets for the year
  const monthlyTargets = db
    .select()
    .from(budgetMonthlyTargets)
    .where(and(gte(budgetMonthlyTargets.month, `${year}-01`), lte(budgetMonthlyTargets.month, `${year}-12`)))
    .all();

  const catTargets = db
    .select()
    .from(budgetCategoryTargets)
    .where(and(gte(budgetCategoryTargets.month, `${year}-01`), lte(budgetCategoryTargets.month, `${year}-12`)))
    .all();

  if (fmt === "csv") {
    // Flat CSV of all transactions
    const header = "Date,Week,Month,Category,Parent Category,Description,Amount\n";
    const body = txRows
      .map((r) => {
        const cat = catById.get(r.categoryId);
        return [
          r.date,
          r.weekLabel,
          r.date.slice(0, 7),
          csvEsc(cat?.name ?? ""),
          csvEsc(cat?.parentCategory ?? ""),
          csvEsc(r.description),
          r.amount,
        ].join(",");
      })
      .join("\n");
    return new NextResponse(header + body, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="budget-${year}.csv"`,
      },
    });
  }

  // XLSX: one sheet per month + a Summary sheet
  const wb = XLSX.utils.book_new();
  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

  for (let m = 1; m <= 12; m++) {
    const monthStr = `${year}-${String(m).padStart(2, "0")}`;
    const monthTarget = monthlyTargets.find((t) => t.month === monthStr);
    const monthCatTargets = catTargets.filter((t) => t.month === monthStr);
    const monthTxs = txRows.filter((t) => t.date.startsWith(monthStr));

    const sheetRows: Record<string, unknown>[] = [];

    // Header metadata rows
    sheetRows.push({ "": "Predicted Income", Value: monthTarget?.predictedIncome ?? 0 });
    sheetRows.push({ "": "Charity Bank Carryover", Value: monthTarget?.charityBankCarryover ?? 0 });
    sheetRows.push({});

    // Category targets
    if (monthCatTargets.length > 0) {
      sheetRows.push({ "": "CATEGORY TARGETS", Value: "" });
      sheetRows.push({ "": "Category", Value: "Target Amount" });
      for (const ct of monthCatTargets) {
        const cat = catById.get(ct.categoryId);
        sheetRows.push({ "": cat?.name ?? `Cat ${ct.categoryId}`, Value: ct.targetAmount });
      }
      sheetRows.push({});
    }

    // Transactions
    sheetRows.push({ "": "TRANSACTIONS" });
    sheetRows.push({ "": "Date", Value: "Category", Parent: "Parent", Desc: "Description", Amount: "Amount" });
    for (const tx of monthTxs) {
      const cat = catById.get(tx.categoryId);
      sheetRows.push({
        "": tx.date,
        Value: cat?.name ?? "",
        Parent: cat?.parentCategory ?? "",
        Desc: tx.description,
        Amount: tx.amount,
      });
    }

    if (monthTxs.length > 0 || monthTarget) {
      const ws = XLSX.utils.json_to_sheet(sheetRows, { skipHeader: true });
      XLSX.utils.book_append_sheet(wb, ws, MONTHS[m - 1]);
    }
  }

  // Summary sheet
  const summaryData = Array.from({ length: 12 }, (_, i) => {
    const monthStr = `${year}-${String(i + 1).padStart(2, "0")}`;
    const monthTxs = txRows.filter((t) => t.date.startsWith(monthStr));
    const income = monthTxs
      .filter((t) => catById.get(t.categoryId)?.isIncomeSource)
      .reduce((s, t) => s + t.amount, 0);
    const funds = monthTxs
      .filter((t) => catById.get(t.categoryId)?.isFunds)
      .reduce((s, t) => s + t.amount, 0);
    const expenses = monthTxs
      .filter((t) => !catById.get(t.categoryId)?.isIncomeSource && !catById.get(t.categoryId)?.isFunds)
      .reduce((s, t) => s + t.amount, 0);
    return {
      Month: MONTHS[i],
      Income: income,
      Expenses: expenses,
      Funds: funds,
      "Net Gain": income - expenses - funds,
    };
  }).filter((r) => r.Income + r.Expenses + r.Funds > 0);

  if (summaryData.length > 0) {
    const ws = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, ws, "Summary");
  }

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="budget-${year}.xlsx"`,
    },
  });
}

function csvEsc(s: string) {
  if (!s) return "";
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
