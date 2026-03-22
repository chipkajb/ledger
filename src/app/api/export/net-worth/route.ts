import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { netWorthSnapshots } from "@/lib/db/schema";
import { and, gte, lte, asc } from "drizzle-orm";
import * as XLSX from "xlsx";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const fmt = searchParams.get("format") ?? "csv";
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const db = getDb();
  const conditions = [];
  if (from) conditions.push(gte(netWorthSnapshots.snapshotDate, from));
  if (to) conditions.push(lte(netWorthSnapshots.snapshotDate, to));

  const rows = db
    .select()
    .from(netWorthSnapshots)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(netWorthSnapshots.snapshotDate))
    .all();

  const data = rows.map((r) => ({
    Date: r.snapshotDate,
    Checking: r.checking ?? 0,
    Savings: r.savings ?? 0,
    "Home Equity": r.homeEquity,
    "401K": r.retirement401k,
    "HSA/HRA": r.hsaHra,
    Investments: r.investments,
    "529 Plan": r.plan529,
    "Teamworks Equity": r.teamworksEquity,
    "Mortgage Balance": r.mortgageBalance,
    "Student Loans": r.studentLoans,
    "Personal Loans": r.personalLoans,
    "Total Assets": r.totalAssets,
    "Total Liabilities": r.totalLiabilities,
    "Net Worth": r.netWorth,
  }));

  const label = from ? `${from}_${to ?? "present"}` : "all";
  const filename = `net-worth-${label}`;

  if (fmt === "xlsx") {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Net Worth");
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
