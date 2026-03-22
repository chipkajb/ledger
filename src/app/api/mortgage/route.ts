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

  if (all.length === 0) {
    return NextResponse.json([]);
  }

  const result = [];
  for (const m of all) {
    const extras = await db
      .select()
      .from(mortgageExtraPayments)
      .where(eq(mortgageExtraPayments.mortgageId, m.id));

    const { rows, summary } = generateSchedule(
      {
        loanAmount: m.loanAmount,
        annualRate: m.annualRate,
        termYears: m.termYears,
        paymentsPerYear: m.paymentsPerYear,
        firstPaymentDate: m.firstPaymentDate,
        monthlyEscrow: m.monthlyEscrow,
        pmi: m.pmi,
        housePrice: m.housePrice,
        downPayment: m.downPayment,
      },
      extras.map((e) => ({ paymentDate: e.paymentDate, amount: e.amount }))
    );

    result.push({
      ...m,
      name: m.label,
      active: m.isActive,
      schedule: rows,
      summary,
    });
  }

  return NextResponse.json(result);
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
