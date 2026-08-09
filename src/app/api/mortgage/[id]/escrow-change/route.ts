import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { mortgageEscrowChanges } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const changes = await db
    .select()
    .from(mortgageEscrowChanges)
    .where(eq(mortgageEscrowChanges.mortgageId, parseInt(params.id)));

  return NextResponse.json(changes);
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { effectiveDate, amount } = body as { effectiveDate: string; amount: number };

  if (!effectiveDate || amount == null || amount < 0) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const db = getDb();
  const mortgageId = parseInt(params.id);

  const existing = await db
    .select()
    .from(mortgageEscrowChanges)
    .where(
      and(
        eq(mortgageEscrowChanges.mortgageId, mortgageId),
        eq(mortgageEscrowChanges.effectiveDate, effectiveDate)
      )
    )
    .get();

  if (existing) {
    const [updated] = await db
      .update(mortgageEscrowChanges)
      .set({ amount })
      .where(eq(mortgageEscrowChanges.id, existing.id))
      .returning();
    return NextResponse.json(updated);
  }

  const [created] = await db
    .insert(mortgageEscrowChanges)
    .values({ mortgageId, effectiveDate, amount })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
