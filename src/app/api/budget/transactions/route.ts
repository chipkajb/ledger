import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { transactions, budgetCategories } from "@/lib/db/schema";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { getWeekLabel } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month"); // YYYY-MM
  const week = searchParams.get("week");   // YYYY-WXX
  const categoryId = searchParams.get("categoryId");

  const db = getDb();

  let query = db
    .select({
      id: transactions.id,
      date: transactions.date,
      amount: transactions.amount,
      description: transactions.description,
      categoryId: transactions.categoryId,
      weekLabel: transactions.weekLabel,
      createdAt: transactions.createdAt,
      categoryName: budgetCategories.name,
      parentCategory: budgetCategories.parentCategory,
      isIncomeSource: budgetCategories.isIncomeSource,
      isFunds: budgetCategories.isFunds,
    })
    .from(transactions)
    .innerJoin(budgetCategories, eq(transactions.categoryId, budgetCategories.id));

  const conditions = [];

  if (month) {
    conditions.push(gte(transactions.date, `${month}-01`));
    conditions.push(lte(transactions.date, `${month}-31`));
  }

  if (week) {
    conditions.push(eq(transactions.weekLabel, week));
  }

  if (categoryId) {
    conditions.push(eq(transactions.categoryId, parseInt(categoryId)));
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as typeof query;
  }

  const rows = await query.orderBy(desc(transactions.date));
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const db = getDb();

  const weekLabel = body.weekLabel ?? getWeekLabel(body.date);

  const [tx] = await db
    .insert(transactions)
    .values({ ...body, weekLabel })
    .returning();

  return NextResponse.json(tx, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const db = getDb();
  await db.delete(transactions).where(eq(transactions.id, parseInt(id)));
  return NextResponse.json({ success: true });
}
