import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { budgetCategories, budgetCategoryTargets, transactions } from "@/lib/db/schema";
import { eq, asc, sql, and } from "drizzle-orm";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const categories = await db
    .select()
    .from(budgetCategories)
    .orderBy(asc(budgetCategories.sortOrder), asc(budgetCategories.name));

  return NextResponse.json(categories);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const db = getDb();

  const [cat] = await db.insert(budgetCategories).values(body).returning();
  return NextResponse.json(cat, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { id, ...updates } = body;
  const db = getDb();

  const [cat] = await db
    .update(budgetCategories)
    .set(updates)
    .where(eq(budgetCategories.id, id))
    .returning();

  return NextResponse.json(cat);
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const db = getDb();

  // Check for associated transactions before deleting
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(transactions)
    .where(eq(transactions.categoryId, parseInt(id)));

  if (count > 0) {
    return NextResponse.json(
      { error: `Cannot delete: ${count} transaction${count !== 1 ? "s" : ""} use this category. Delete them first.` },
      { status: 409 }
    );
  }

  // Delete category-level monthly targets first (FK constraint)
  await db.delete(budgetCategoryTargets).where(eq(budgetCategoryTargets.categoryId, parseInt(id)));
  await db.delete(budgetCategories).where(eq(budgetCategories.id, parseInt(id)));
  return NextResponse.json({ success: true });
}
