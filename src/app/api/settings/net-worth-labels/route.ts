import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { appSettings } from "@/lib/db/schema";
import { eq, like } from "drizzle-orm";

export const dynamic = "force-dynamic";

const PREFIX = "nw_label_";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const rows = await db
    .select()
    .from(appSettings)
    .where(like(appSettings.key, `${PREFIX}%`));

  const labels: Record<string, string> = {};
  for (const row of rows) {
    labels[row.key.slice(PREFIX.length)] = row.value;
  }
  return NextResponse.json(labels);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body: Record<string, string> = await req.json();
  const db = getDb();

  for (const [fieldKey, label] of Object.entries(body)) {
    const key = `${PREFIX}${fieldKey}`;
    const existing = await db.select().from(appSettings).where(eq(appSettings.key, key)).get();
    if (existing) {
      await db.update(appSettings).set({ value: label }).where(eq(appSettings.key, key));
    } else {
      await db.insert(appSettings).values({ key, value: label });
    }
  }

  return NextResponse.json({ success: true });
}
