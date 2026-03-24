import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import {
  transactions,
  budgetCategories,
  budgetMonthlyTargets,
  budgetCategoryTargets,
} from "@/lib/db/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month"); // YYYY-MM
  if (!month) return NextResponse.json({ error: "month required" }, { status: 400 });

  const db = getDb();

  // Get monthly target
  const monthlyTarget = await db
    .select()
    .from(budgetMonthlyTargets)
    .where(eq(budgetMonthlyTargets.month, month))
    .get();

  // Get all categories
  const categories = await db
    .select()
    .from(budgetCategories)
    .orderBy(budgetCategories.sortOrder);

  // Get category-level targets for this month
  const categoryTargets = await db
    .select()
    .from(budgetCategoryTargets)
    .where(eq(budgetCategoryTargets.month, month));

  const categoryTargetMap = new Map(
    categoryTargets.map((ct) => [ct.categoryId, ct.targetAmount])
  );

  // Get actual spending by category
  const actuals = await db
    .select({
      categoryId: transactions.categoryId,
      total: sql<number>`sum(${transactions.amount})`,
    })
    .from(transactions)
    .where(
      and(
        gte(transactions.date, `${month}-01`),
        lte(transactions.date, `${month}-31`)
      )
    )
    .groupBy(transactions.categoryId);

  const actualMap = new Map(actuals.map((a) => [a.categoryId, a.total]));

  // Build summary per category
  const categorySummaries = categories.map((cat) => {
    const target =
      categoryTargetMap.get(cat.id) ??
      cat.budgetAmount ??
      (cat.budgetPct && monthlyTarget?.predictedIncome
        ? cat.budgetPct * monthlyTarget.predictedIncome
        : 0);
    const actual = actualMap.get(cat.id) ?? 0;
    const pctOfTarget = target > 0 ? (actual / target) * 100 : null;

    return {
      id: cat.id,
      name: cat.name,
      parentCategory: cat.parentCategory,
      isIncomeSource: cat.isIncomeSource,
      target,
      actual,
      pctOfTarget,
      difference: actual - target,
    };
  });

  // Group by parent
  const parentGroups: Record<
    string,
    {
      parentCategory: string;
      target: number;
      actual: number;
      categories: typeof categorySummaries;
    }
  > = {};

  for (const cat of categorySummaries) {
    if (!parentGroups[cat.parentCategory]) {
      parentGroups[cat.parentCategory] = {
        parentCategory: cat.parentCategory,
        target: 0,
        actual: 0,
        categories: [],
      };
    }
    parentGroups[cat.parentCategory].target += cat.target;
    parentGroups[cat.parentCategory].actual += cat.actual;
    parentGroups[cat.parentCategory].categories.push(cat);
  }

  // Totals
  const incomeCategories = categorySummaries.filter((c) => c.isIncomeSource);
  const expenseCategories = categorySummaries.filter((c) => !c.isIncomeSource);

  const totalIncome = incomeCategories.reduce((s, c) => s + c.actual, 0);
  const totalExpenses = expenseCategories.reduce((s, c) => s + c.actual, 0);
  const predictedIncome = monthlyTarget?.predictedIncome ?? 0;

  // Charity bank: carryover + giving target - actual giving
  const givingCats = expenseCategories.filter(
    (c) => c.parentCategory === "Giving"
  );
  const totalGivingTarget = givingCats.reduce((s, c) => s + c.target, 0);
  const totalGivingActual = givingCats.reduce((s, c) => s + c.actual, 0);
  const charityBankCarryover = monthlyTarget?.charityBankCarryover ?? 0;
  const charityBankBalance =
    charityBankCarryover + totalGivingTarget - totalGivingActual;

  return NextResponse.json({
    month,
    predictedIncome,
    totalIncome,
    totalExpenses,
    netGain: totalIncome - totalExpenses,
    charityBankBalance,
    charityBankCarryover,
    parentGroups: Object.values(parentGroups),
    categories: categorySummaries,
  });
}
