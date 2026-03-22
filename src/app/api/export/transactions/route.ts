import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { transactions, budgetCategories } from "@/lib/db/schema";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import * as XLSX from "xlsx";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const fmt = searchParams.get("format") ?? "csv"; // csv | xlsx
  const month = searchParams.get("month"); // YYYY-MM
  const year = searchParams.get("year"); // YYYY
  const from = searchParams.get("from"); // YYYY-MM-DD
  const to = searchParams.get("to"); // YYYY-MM-DD
  const categoryId = searchParams.get("categoryId");
  const week = searchParams.get("week"); // YYYY-WXX

  const db = getDb();

  // Build where conditions
  const conditions = [];

  if (week) {
    const rows = db
      .select({
        id: transactions.id,
        date: transactions.date,
        amount: transactions.amount,
        description: transactions.description,
        weekLabel: transactions.weekLabel,
        categoryName: budgetCategories.name,
        parentCategory: budgetCategories.parentCategory,
      })
      .from(transactions)
      .innerJoin(budgetCategories, eq(transactions.categoryId, budgetCategories.id))
      .where(eq(transactions.weekLabel, week))
      .orderBy(desc(transactions.date))
      .all();
    return buildResponse(rows, fmt, `transactions-${week}`);
  }

  if (month) {
    const fromDate = `${month}-01`;
    const toDate = `${month}-31`;
    conditions.push(gte(transactions.date, fromDate), lte(transactions.date, toDate));
  } else if (year) {
    conditions.push(gte(transactions.date, `${year}-01-01`), lte(transactions.date, `${year}-12-31`));
  } else if (from || to) {
    if (from) conditions.push(gte(transactions.date, from));
    if (to) conditions.push(lte(transactions.date, to));
  }

  if (categoryId) {
    conditions.push(eq(transactions.categoryId, parseInt(categoryId)));
  }

  const rows = db
    .select({
      id: transactions.id,
      date: transactions.date,
      amount: transactions.amount,
      description: transactions.description,
      weekLabel: transactions.weekLabel,
      categoryName: budgetCategories.name,
      parentCategory: budgetCategories.parentCategory,
    })
    .from(transactions)
    .innerJoin(budgetCategories, eq(transactions.categoryId, budgetCategories.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(transactions.date))
    .all();

  const label = month ?? year ?? (from ? `${from}_${to ?? ""}` : "all");
  return buildResponse(rows, fmt, `transactions-${label}`);
}

type TxRow = {
  id: number;
  date: string;
  amount: number;
  description: string;
  weekLabel: string;
  categoryName: string;
  parentCategory: string;
};

function buildResponse(rows: TxRow[], fmt: string, filename: string) {
  const data = rows.map((r) => ({
    Date: r.date,
    "Week Label": r.weekLabel,
    Category: r.categoryName,
    "Parent Category": r.parentCategory,
    Description: r.description,
    Amount: r.amount,
  }));

  if (fmt === "xlsx") {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Transactions");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}.xlsx"`,
      },
    });
  }

  // Default: CSV
  const header = "Date,Week Label,Category,Parent Category,Description,Amount\n";
  const body = data
    .map((r) =>
      [r.Date, r["Week Label"], csvEsc(r.Category), csvEsc(r["Parent Category"]), csvEsc(r.Description), r.Amount].join(",")
    )
    .join("\n");

  return new NextResponse(header + body, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${filename}.csv"`,
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
