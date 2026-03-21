import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { budgetMonthlyTargets, budgetCategoryTargets } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month");
  if (!month) return NextResponse.json({ error: "month required" }, { status: 400 });

  const db = getDb();

  const target = await db
    .select()
    .from(budgetMonthlyTargets)
    .where(eq(budgetMonthlyTargets.month, month))
    .get();

  const categoryTargets = await db
    .select()
    .from(budgetCategoryTargets)
    .where(eq(budgetCategoryTargets.month, month));

  return NextResponse.json({ target, categoryTargets });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { month, predictedIncome, charityBankCarryover, categoryTargets: catTargets } = body;

  const db = getDb();

  // Upsert monthly target
  const existing = await db
    .select()
    .from(budgetMonthlyTargets)
    .where(eq(budgetMonthlyTargets.month, month))
    .get();

  if (existing) {
    await db
      .update(budgetMonthlyTargets)
      .set({
        predictedIncome: predictedIncome ?? existing.predictedIncome,
        charityBankCarryover: charityBankCarryover ?? existing.charityBankCarryover,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(budgetMonthlyTargets.month, month));
  } else {
    await db.insert(budgetMonthlyTargets).values({
      month,
      predictedIncome: predictedIncome ?? 0,
      charityBankCarryover: charityBankCarryover ?? 0,
    });
  }

  // Handle category targets if provided
  if (catTargets && Array.isArray(catTargets)) {
    for (const ct of catTargets) {
      const existingCt = await db
        .select()
        .from(budgetCategoryTargets)
        .where(
          and(
            eq(budgetCategoryTargets.month, month),
            eq(budgetCategoryTargets.categoryId, ct.categoryId)
          )
        )
        .get();

      if (existingCt) {
        await db
          .update(budgetCategoryTargets)
          .set({ targetAmount: ct.targetAmount })
          .where(eq(budgetCategoryTargets.id, existingCt.id));
      } else {
        await db.insert(budgetCategoryTargets).values({
          month,
          categoryId: ct.categoryId,
          targetAmount: ct.targetAmount,
        });
      }
    }
  }

  return NextResponse.json({ success: true });
}
