import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { netWorthSnapshots } from "@/lib/db/schema";
import { eq, desc, gte, lte, and } from "drizzle-orm";

export const dynamic = "force-dynamic";

function computeTotals(data: Record<string, number>) {
  const totalAssets =
    (data.checking ?? 0) +
    (data.savings ?? 0) +
    (data.homeEquity ?? 0) +
    (data.retirement401k ?? 0) +
    (data.hsaHra ?? 0) +
    (data.investments ?? 0) +
    (data.plan529 ?? 0) +
    (data.teamworksEquity ?? 0);

  const totalLiabilities =
    (data.mortgageBalance ?? 0) +
    (data.studentLoans ?? 0) +
    (data.personalLoans ?? 0);

  return {
    totalAssets,
    totalLiabilities,
    netWorth: totalAssets - totalLiabilities,
  };
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const limit = parseInt(searchParams.get("limit") ?? "100");
  const page = parseInt(searchParams.get("page") ?? "1");

  const db = getDb();

  const conditions = [];
  if (from) conditions.push(gte(netWorthSnapshots.snapshotDate, from));
  if (to) conditions.push(lte(netWorthSnapshots.snapshotDate, to));

  let query = db.select().from(netWorthSnapshots);

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as typeof query;
  }

  const allRows = await query.orderBy(desc(netWorthSnapshots.snapshotDate));

  const total = allRows.length;
  const offset = (page - 1) * limit;
  const rows = allRows.slice(offset, offset + limit);

  // Add delta (difference from previous snapshot)
  const withDelta = rows.map((row) => {
    const prev = allRows[allRows.indexOf(row) + 1];
    return {
      ...row,
      delta: prev ? row.netWorth - prev.netWorth : null,
    };
  });

  return NextResponse.json({ snapshots: withDelta, total, page, limit });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const totals = computeTotals(body);
  const db = getDb();

  const [snap] = await db
    .insert(netWorthSnapshots)
    .values({ ...body, ...totals })
    .returning();

  return NextResponse.json(snap, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { id, ...updates } = body;
  const totals = computeTotals({ ...updates });
  const db = getDb();

  const [snap] = await db
    .update(netWorthSnapshots)
    .set({ ...updates, ...totals })
    .where(eq(netWorthSnapshots.id, id))
    .returning();

  return NextResponse.json(snap);
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const db = getDb();
  await db.delete(netWorthSnapshots).where(eq(netWorthSnapshots.id, parseInt(id)));
  return NextResponse.json({ success: true });
}
