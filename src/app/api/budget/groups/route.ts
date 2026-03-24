import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { budgetCategories, budgetCategoryTargets, transactions } from "@/lib/db/schema";
import { eq, sql, inArray } from "drizzle-orm";

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { oldName, newName } = body;
  if (!oldName || !newName)
    return NextResponse.json({ error: "oldName and newName are required" }, { status: 400 });

  const db = getDb();
  await db
    .update(budgetCategories)
    .set({ parentCategory: newName })
    .where(eq(budgetCategories.parentCategory, oldName));

  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const name = searchParams.get("name");
  if (!name) return NextResponse.json({ error: "Missing name" }, { status: 400 });

  const db = getDb();

  const cats = await db
    .select({ id: budgetCategories.id })
    .from(budgetCategories)
    .where(eq(budgetCategories.parentCategory, name));

  if (cats.length === 0) return NextResponse.json({ success: true });

  const catIds = cats.map((c) => c.id);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(transactions)
    .where(inArray(transactions.categoryId, catIds));

  if (count > 0) {
    return NextResponse.json(
      {
        error: `Cannot delete: ${count} transaction${count !== 1 ? "s" : ""} reference categories in this group. Delete them first.`,
      },
      { status: 409 }
    );
  }

  for (const cat of cats) {
    await db.delete(budgetCategoryTargets).where(eq(budgetCategoryTargets.categoryId, cat.id));
  }
  await db.delete(budgetCategories).where(eq(budgetCategories.parentCategory, name));

  return NextResponse.json({ success: true });
}
