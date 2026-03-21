import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { budgetCategories } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";

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
