import { getDb } from "@/lib/db";
import { netWorthSnapshots } from "@/lib/db/schema";
import type { BalanceAnchor } from "@/lib/mortgage";
import { desc } from "drizzle-orm";

export async function getLatestMortgageBalanceAnchor(): Promise<BalanceAnchor | null> {
  const db = getDb();
  const latestSnapshot = await db
    .select({
      snapshotDate: netWorthSnapshots.snapshotDate,
      mortgageBalance: netWorthSnapshots.mortgageBalance,
    })
    .from(netWorthSnapshots)
    .orderBy(desc(netWorthSnapshots.snapshotDate))
    .limit(1);

  const snapshot = latestSnapshot[0];
  if (!snapshot || snapshot.mortgageBalance <= 0) return null;

  return {
    date: snapshot.snapshotDate,
    balance: snapshot.mortgageBalance,
  };
}
