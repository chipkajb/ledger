import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { netWorthSnapshots } from "@/lib/db/schema";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();

  const latest = await db
    .select()
    .from(netWorthSnapshots)
    .orderBy(desc(netWorthSnapshots.snapshotDate))
    .limit(2)
    .all();

  const current = latest[0] ?? null;
  const previous = latest[1] ?? null;

  return NextResponse.json({
    current,
    previous,
    delta: current && previous ? current.netWorth - previous.netWorth : null,
  });
}
