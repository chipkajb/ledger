import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { mortgages, mortgageExtraPayments } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { generateSchedule } from "@/lib/mortgage";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const mortgage = await db
    .select()
    .from(mortgages)
    .where(eq(mortgages.id, parseInt(params.id)))
    .get();

  if (!mortgage) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const extras = await db
    .select()
    .from(mortgageExtraPayments)
    .where(eq(mortgageExtraPayments.mortgageId, mortgage.id));

  const { rows, summary } = generateSchedule(
    {
      loanAmount: mortgage.loanAmount,
      annualRate: mortgage.annualRate,
      termYears: mortgage.termYears,
      paymentsPerYear: mortgage.paymentsPerYear,
      firstPaymentDate: mortgage.firstPaymentDate,
      monthlyEscrow: mortgage.monthlyEscrow,
      pmi: mortgage.pmi,
      housePrice: mortgage.housePrice,
      downPayment: mortgage.downPayment,
    },
    extras.map((e) => ({ paymentDate: e.paymentDate, amount: e.amount }))
  );

  return NextResponse.json({ mortgage, extras, schedule: rows, summary });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const db = getDb();

  if (body.isActive) {
    await db.update(mortgages).set({ isActive: false });
  }

  const [mortgage] = await db
    .update(mortgages)
    .set(body)
    .where(eq(mortgages.id, parseInt(params.id)))
    .returning();

  return NextResponse.json(mortgage);
}
