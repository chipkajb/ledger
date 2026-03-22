import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { mortgages, mortgageExtraPayments } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { generateSchedule } from "@/lib/mortgage";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();

  const all = await db
    .select()
    .from(mortgages)
    .orderBy(desc(mortgages.createdAt));

  // Get active mortgage schedule
  const active = all.find((m) => m.isActive) ?? all[0];
  if (!active) {
    return NextResponse.json({ mortgages: all, active: null, schedule: null, summary: null });
  }

  const extras = await db
    .select()
    .from(mortgageExtraPayments)
    .where(eq(mortgageExtraPayments.mortgageId, active.id));

  const { rows, summary } = generateSchedule(
    {
      loanAmount: active.loanAmount,
      annualRate: active.annualRate,
      termYears: active.termYears,
      paymentsPerYear: active.paymentsPerYear,
      firstPaymentDate: active.firstPaymentDate,
      monthlyEscrow: active.monthlyEscrow,
      pmi: active.pmi,
      housePrice: active.housePrice,
      downPayment: active.downPayment,
    },
    extras.map((e) => ({ paymentDate: e.paymentDate, amount: e.amount }))
  );

  return NextResponse.json({ mortgages: all, active, schedule: rows, summary });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const db = getDb();

  // If new mortgage is active, deactivate others
  if (body.isActive) {
    await db.update(mortgages).set({ isActive: false });
  }

  const [mortgage] = await db.insert(mortgages).values(body).returning();
  return NextResponse.json(mortgage, { status: 201 });
}
