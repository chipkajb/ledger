import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { mortgages, mortgageExtraPayments } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { generateSchedule } from "@/lib/mortgage";
import * as XLSX from "xlsx";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const fmt = searchParams.get("format") ?? "csv";
  const mortgageId = searchParams.get("id");
  const scheduleType = searchParams.get("type") ?? "current"; // current | original

  const db = getDb();

  // Resolve which mortgage to export
  let mortgage;
  if (mortgageId) {
    mortgage = db.select().from(mortgages).where(eq(mortgages.id, parseInt(mortgageId))).get();
  } else {
    mortgage = db.select().from(mortgages).where(eq(mortgages.isActive, true)).get()
      ?? db.select().from(mortgages).orderBy(mortgages.id).get();
  }

  if (!mortgage) {
    return NextResponse.json({ error: "No mortgage found" }, { status: 404 });
  }

  const extraPayments = scheduleType === "original" ? [] :
    db.select().from(mortgageExtraPayments).where(eq(mortgageExtraPayments.mortgageId, mortgage.id)).all();

  const { rows } = generateSchedule(
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
    extraPayments.map((ep) => ({ paymentDate: ep.paymentDate, amount: ep.amount }))
  );

  const data = rows.map((r) => ({
    "#": r.paymentNumber,
    Date: r.date,
    Payment: r.payment,
    Principal: r.principal,
    Interest: r.interest,
    PMI: r.pmi,
    Escrow: r.escrow,
    "Extra Payment": r.extraPayment,
    "Total Payment": r.totalPayment,
    "Ending Balance": r.endingBalance,
    "Home Equity": r.homeEquity,
    "Equity %": r.equityPct,
  }));

  const typeLabel = scheduleType === "original" ? "original" : "with-extra";
  const filename = `mortgage-${mortgage.id}-${typeLabel}`;

  if (fmt === "xlsx") {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Amortization");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}.xlsx"`,
      },
    });
  }

  const cols = Object.keys(data[0] ?? {});
  const header = cols.join(",") + "\n";
  const body = data
    .map((r) => cols.map((c) => (r as Record<string, unknown>)[c]).join(","))
    .join("\n");

  return new NextResponse(header + body, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${filename}.csv"`,
    },
  });
}
