import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { appSettings } from "@/lib/db/schema";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { newPassword } = await req.json();
  if (!newPassword || newPassword.length < 8) {
    return NextResponse.json({ error: "Password too short" }, { status: 400 });
  }

  const hash = await bcrypt.hash(newPassword, 12);
  const db = getDb();

  await db
    .insert(appSettings)
    .values({ key: "admin_password_hash", value: hash })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: hash } });

  return NextResponse.json({ success: true });
}
