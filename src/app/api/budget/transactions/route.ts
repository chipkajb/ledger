import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { transactions, budgetCategories } from "@/lib/db/schema";
import { eq, and, gte, lte, desc, inArray } from "drizzle-orm";
import { getWeekLabel } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month");           // YYYY-MM
  const startMonth = searchParams.get("startMonth"); // YYYY-MM
  const endMonth = searchParams.get("endMonth");     // YYYY-MM
  const week = searchParams.get("week");             // YYYY-WXX
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

  if (startMonth) {
    conditions.push(gte(transactions.date, `${startMonth}-01`));
  }

  if (endMonth) {
    conditions.push(lte(transactions.date, `${endMonth}-31`));
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

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { id, month, ...rest } = body;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const db = getDb();

  const updates: Record<string, unknown> = { ...rest };
  if (month) {
    updates.date = `${month}-01`;
    updates.weekLabel = getWeekLabel(`${month}-01`);
  }

  const [tx] = await db
    .update(transactions)
    .set(updates)
    .where(eq(transactions.id, id))
    .returning();

  return NextResponse.json(tx);
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const ids = searchParams.get("ids");             // comma-separated ids
  const month = searchParams.get("month");         // YYYY-MM: delete all in this month
  const startMonth = searchParams.get("startMonth");
  const endMonth = searchParams.get("endMonth");
  const all = searchParams.get("all");             // "true" to delete everything

  const db = getDb();

  if (all === "true") {
    await db.delete(transactions);
  } else if (ids) {
    const idList = ids.split(",").map(Number).filter((n) => !isNaN(n));
    if (idList.length === 0) return NextResponse.json({ error: "No valid ids" }, { status: 400 });
    await db.delete(transactions).where(inArray(transactions.id, idList));
  } else if (startMonth || endMonth) {
    const conditions = [];
    if (startMonth) conditions.push(gte(transactions.date, `${startMonth}-01`));
    if (endMonth) conditions.push(lte(transactions.date, `${endMonth}-31`));
    await db.delete(transactions).where(and(...conditions));
  } else if (month) {
    await db.delete(transactions).where(
      and(gte(transactions.date, `${month}-01`), lte(transactions.date, `${month}-31`))
    );
  } else if (id) {
    await db.delete(transactions).where(eq(transactions.id, parseInt(id)));
  } else {
    return NextResponse.json({ error: "Missing filter parameter" }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
