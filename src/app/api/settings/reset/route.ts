import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import {
  transactions,
  budgetCategories,
  budgetMonthlyTargets,
  budgetCategoryTargets,
  netWorthSnapshots,
  mortgages,
  mortgageExtraPayments,
} from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export async function POST() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();

  // Delete in dependency order (children before parents)
  await db.delete(mortgageExtraPayments);
  await db.delete(mortgages);
  await db.delete(transactions);
  await db.delete(budgetCategoryTargets);
  await db.delete(budgetMonthlyTargets);
  await db.delete(budgetCategories);
  await db.delete(netWorthSnapshots);

  return NextResponse.json({ success: true });
}
