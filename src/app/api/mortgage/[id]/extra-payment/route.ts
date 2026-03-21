import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { mortgageExtraPayments } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const extras = await db
    .select()
    .from(mortgageExtraPayments)
    .where(eq(mortgageExtraPayments.mortgageId, parseInt(params.id)));

  return NextResponse.json(extras);
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const db = getDb();

  const [extra] = await db
    .insert(mortgageExtraPayments)
    .values({ ...body, mortgageId: parseInt(params.id) })
    .returning();

  return NextResponse.json(extra, { status: 201 });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const paymentId = searchParams.get("paymentId");
  if (!paymentId) return NextResponse.json({ error: "Missing paymentId" }, { status: 400 });

  const db = getDb();
  await db
    .delete(mortgageExtraPayments)
    .where(
      and(
        eq(mortgageExtraPayments.id, parseInt(paymentId)),
        eq(mortgageExtraPayments.mortgageId, parseInt(params.id))
      )
    );

  return NextResponse.json({ success: true });
}
