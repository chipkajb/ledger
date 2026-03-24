import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import {
  transactions,
  budgetCategories,
  budgetMonthlyTargets,
} from "@/lib/db/schema";
import { and, gte, lte, sql, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const year = searchParams.get("year") ?? new Date().getFullYear().toString();

  const db = getDb();

  // Monthly totals by parent category
  const rows = await db
    .select({
      month: sql<string>`strftime('%Y-%m', ${transactions.date})`,
      parentCategory: budgetCategories.parentCategory,
      isIncomeSource: budgetCategories.isIncomeSource,
      total: sql<number>`sum(${transactions.amount})`,
    })
    .from(transactions)
    .innerJoin(budgetCategories, eq(transactions.categoryId, budgetCategories.id))
    .where(
      and(
        gte(transactions.date, `${year}-01-01`),
        lte(transactions.date, `${year}-12-31`)
      )
    )
    .groupBy(
      sql`strftime('%Y-%m', ${transactions.date})`,
      budgetCategories.parentCategory
    );

  // Monthly targets
  const targets = await db
    .select()
    .from(budgetMonthlyTargets)
    .where(
      and(
        gte(budgetMonthlyTargets.month, `${year}-01`),
        lte(budgetMonthlyTargets.month, `${year}-12`)
      )
    );

  const targetMap = new Map(targets.map((t) => [t.month, t]));

  // Build months array
  const months = Array.from({ length: 12 }, (_, i) =>
    `${year}-${String(i + 1).padStart(2, "0")}`
  );

  const monthData = months.map((month) => {
    const monthRows = rows.filter((r) => r.month === month);
    const target = targetMap.get(month);

    const income = monthRows
      .filter((r) => r.isIncomeSource)
      .reduce((s, r) => s + r.total, 0);

    const expenses = monthRows
      .filter((r) => !r.isIncomeSource)
      .reduce((s, r) => s + r.total, 0);

    const categoryBreakdown: Record<string, number> = {};
    for (const r of monthRows) {
      categoryBreakdown[r.parentCategory] =
        (categoryBreakdown[r.parentCategory] ?? 0) + r.total;
    }

    return {
      month,
      income,
      expenses,
      netGain: income - expenses,
      predictedIncome: target?.predictedIncome ?? 0,
      categoryBreakdown,
    };
  });

  // Yearly category totals
  const yearlyCategoryTotals = await db
    .select({
      categoryId: transactions.categoryId,
      name: budgetCategories.name,
      parentCategory: budgetCategories.parentCategory,
      isIncomeSource: budgetCategories.isIncomeSource,
      budgetAmount: budgetCategories.budgetAmount,
      budgetPct: budgetCategories.budgetPct,
      total: sql<number>`sum(${transactions.amount})`,
    })
    .from(transactions)
    .innerJoin(budgetCategories, eq(transactions.categoryId, budgetCategories.id))
    .where(
      and(
        gte(transactions.date, `${year}-01-01`),
        lte(transactions.date, `${year}-12-31`)
      )
    )
    .groupBy(transactions.categoryId);

  return NextResponse.json({ months: monthData, categories: yearlyCategoryTotals });
}
