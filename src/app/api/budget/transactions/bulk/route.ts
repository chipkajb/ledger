import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { transactions, budgetCategories } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getWeekLabel } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { amounts, month, categoryId, newCategoryName, newParentCategory } = body as {
    amounts: number[];
    month: string; // YYYY-MM
    categoryId?: number;
    newCategoryName?: string;
    newParentCategory?: string;
  };

  if (!amounts?.length) {
    return NextResponse.json({ error: "No amounts provided" }, { status: 400 });
  }
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "Invalid month (expected YYYY-MM)" }, { status: 400 });
  }

  const db = getDb();
  let resolvedCategoryId = categoryId;

  // If free-text category provided, find or create it
  if (!resolvedCategoryId) {
    if (!newCategoryName || !newParentCategory) {
      return NextResponse.json(
        { error: "Either categoryId or newCategoryName + newParentCategory is required" },
        { status: 400 }
      );
    }

    const existing = await db
      .select({ id: budgetCategories.id })
      .from(budgetCategories)
      .where(
        and(
          eq(budgetCategories.name, newCategoryName.trim()),
          eq(budgetCategories.parentCategory, newParentCategory.trim())
        )
      )
      .limit(1);

    if (existing.length > 0) {
      resolvedCategoryId = existing[0].id;
    } else {
      const [created] = await db
        .insert(budgetCategories)
        .values({
          name: newCategoryName.trim(),
          parentCategory: newParentCategory.trim(),
          isIncomeSource: false,
          isFunds: false,
          sortOrder: 0,
        })
        .returning({ id: budgetCategories.id });
      resolvedCategoryId = created.id;
    }
  } else {
    // Verify the category exists
    const found = await db
      .select({ id: budgetCategories.id })
      .from(budgetCategories)
      .where(eq(budgetCategories.id, resolvedCategoryId))
      .limit(1);
    if (found.length === 0) {
      return NextResponse.json({ error: `Category ${resolvedCategoryId} not found` }, { status: 400 });
    }
  }

  // All transactions dated to the 1st of the month
  const date = `${month}-01`;
  const weekLabel = getWeekLabel(date);

  const rows = amounts.map((amount) => ({
    date,
    amount,
    description: "",
    categoryId: resolvedCategoryId!,
    weekLabel,
  }));

  try {
    await db.insert(transactions).values(rows);
  } catch (err) {
    console.error("Bulk insert error:", err);
    return NextResponse.json({ error: "Failed to insert transactions" }, { status: 500 });
  }

  return NextResponse.json({ inserted: rows.length, categoryId: resolvedCategoryId }, { status: 201 });
}
