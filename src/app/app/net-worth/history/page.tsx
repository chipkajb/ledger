"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/utils";
import { format, subYears } from "date-fns";

interface Snapshot {
  id: string;
  date: string;
  checkingAccount: number;
  savingsAccount: number;
  homeEquity: number;
  retirement401k: number;
  hsaHra: number;
  investments: number;
  plan529: number;
  teamworksEquity: number;
  mortgageBalance: number;
  studentLoans: number;
  personalLoans: number;
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  delta?: number;
}

interface PaginatedResponse {
  data: Snapshot[];
  total: number;
  page: number;
  limit: number;
}

const ASSET_COLORS: Record<string, string> = {
  checkingAccount: "#3b82f6",
  savingsAccount: "#10b981",
  homeEquity: "#f59e0b",
  retirement401k: "#8b5cf6",
  hsaHra: "#ec4899",
  investments: "#06b6d4",
  plan529: "#84cc16",
  teamworksEquity: "#f97316",
};

const ASSET_LABELS: Record<string, string> = {
  checkingAccount: "Checking",
  savingsAccount: "Savings",
  homeEquity: "Home Equity",
  retirement401k: "401K",
  hsaHra: "HSA/HRA",
  investments: "Investments",
  plan529: "529 Plan",
  teamworksEquity: "Teamworks",
};

function formatCurrencyShort(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function todayStr() {
  return format(new Date(), "yyyy-MM-dd");
}

function oneYearAgoStr() {
  return format(subYears(new Date(), 1), "yyyy-MM-dd");
}

export default function NetWorthHistoryPage() {
  const [from, setFrom] = useState(oneYearAgoStr());
  const [to, setTo] = useState(todayStr());
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const LIMIT = 50;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        from,
        to,
        page: page.toString(),
        limit: LIMIT.toString(),
      });
      const res = await fetch(`/api/net-worth/snapshots?${params}`);
      if (res.ok) {
        const json: PaginatedResponse = await res.json();
        setSnapshots(json.data ?? []);
        setTotal(json.total ?? 0);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [from, to, page]);

  useEffect(() => {
    load();
  }, [load]);

  // Enrich snapshots with delta
  const enriched = snapshots.map((s, i) => {
    const prev = snapshots[i - 1];
    return { ...s, delta: prev ? s.netWorth - prev.netWorth : undefined };
  });

  // Week-over-week delta chart data (only snapshots with a previous)
  const deltaData = enriched
    .filter((s) => s.delta !== undefined)
    .map((s) => ({ date: s.date, delta: s.delta ?? 0 }));

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Net Worth History</h1>
        <p className="text-muted-foreground">Charts and full history of your net worth snapshots.</p>
      </div>

      {/* Date range picker */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 pt-6">
          <div className="space-y-1">
            <label className="text-sm font-medium">From</label>
            <Input
              type="date"
              value={from}
              onChange={(e) => { setFrom(e.target.value); setPage(1); }}
              className="w-40"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">To</label>
            <Input
              type="date"
              value={to}
              onChange={(e) => { setTo(e.target.value); setPage(1); }}
              className="w-40"
            />
          </div>
          <Button variant="outline" onClick={() => { setFrom(oneYearAgoStr()); setTo(todayStr()); setPage(1); }}>
            Last 12 Months
          </Button>
          <Button variant="outline" onClick={() => { setFrom(format(subYears(new Date(), 5), "yyyy-MM-dd")); setTo(todayStr()); setPage(1); }}>
            Last 5 Years
          </Button>
        </CardContent>
      </Card>

      {loading ? (
        <div className="grid gap-6 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-72 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : snapshots.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No snapshots found for this date range.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Charts */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* 1. Net Worth over time */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Net Worth Over Time</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={enriched} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => format(new Date(v + "T00:00:00"), "MMM yy")}
                    />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={formatCurrencyShort} width={64} />
                    <Tooltip formatter={(v: number) => formatCurrency(v)} labelFormatter={(l) => `Date: ${l}`} />
                    <Line
                      type="monotone"
                      dataKey="netWorth"
                      name="Net Worth"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* 2. Stacked area: asset breakdown */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Asset Breakdown Over Time</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={enriched} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => format(new Date(v + "T00:00:00"), "MMM yy")}
                    />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={formatCurrencyShort} width={64} />
                    <Tooltip formatter={(v: number) => formatCurrency(v)} labelFormatter={(l) => `Date: ${l}`} />
                    <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                    {Object.keys(ASSET_COLORS).map((key) => (
                      <Area
                        key={key}
                        type="monotone"
                        dataKey={key}
                        name={ASSET_LABELS[key]}
                        stackId="assets"
                        stroke={ASSET_COLORS[key]}
                        fill={ASSET_COLORS[key]}
                        fillOpacity={0.7}
                      />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* 3. Bar chart: week-over-week delta */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Snapshot-over-Snapshot Delta</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={deltaData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => format(new Date(v + "T00:00:00"), "MMM yy")}
                    />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={formatCurrencyShort} width={64} />
                    <Tooltip formatter={(v: number) => formatCurrency(v)} labelFormatter={(l) => `Date: ${l}`} />
                    <Bar
                      dataKey="delta"
                      name="Change"
                      fill="#3b82f6"
                      radius={[2, 2, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* 4. Stacked bar: Assets vs Liabilities */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Assets vs Liabilities Over Time</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={enriched} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => format(new Date(v + "T00:00:00"), "MMM yy")}
                    />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={formatCurrencyShort} width={64} />
                    <Tooltip formatter={(v: number) => formatCurrency(v)} labelFormatter={(l) => `Date: ${l}`} />
                    <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="totalAssets" name="Total Assets" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="totalLiabilities" name="Total Liabilities" stackId="b" fill="#ef4444" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* History Table */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Snapshot History</CardTitle>
              <span className="text-sm text-muted-foreground">
                {total} snapshot{total !== 1 ? "s" : ""}
              </span>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      {[
                        "Date", "Checking", "Savings", "Home Equity", "401K",
                        "HSA/HRA", "Investments", "529", "Teamworks",
                        "Mortgage", "Student Loans", "Personal Loans",
                        "Total Assets", "Total Liabilities", "Net Worth", "Delta",
                      ].map((col) => (
                        <th key={col} className="whitespace-nowrap px-3 py-2 text-left font-medium text-muted-foreground">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {enriched.map((s, i) => (
                      <tr key={s.id ?? i} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="whitespace-nowrap px-3 py-2 font-medium">{s.date}</td>
                        <td className="whitespace-nowrap px-3 py-2">{formatCurrency(s.checkingAccount)}</td>
                        <td className="whitespace-nowrap px-3 py-2">{formatCurrency(s.savingsAccount)}</td>
                        <td className="whitespace-nowrap px-3 py-2">{formatCurrency(s.homeEquity)}</td>
                        <td className="whitespace-nowrap px-3 py-2">{formatCurrency(s.retirement401k)}</td>
                        <td className="whitespace-nowrap px-3 py-2">{formatCurrency(s.hsaHra)}</td>
                        <td className="whitespace-nowrap px-3 py-2">{formatCurrency(s.investments)}</td>
                        <td className="whitespace-nowrap px-3 py-2">{formatCurrency(s.plan529)}</td>
                        <td className="whitespace-nowrap px-3 py-2">{formatCurrency(s.teamworksEquity)}</td>
                        <td className="whitespace-nowrap px-3 py-2">{formatCurrency(s.mortgageBalance)}</td>
                        <td className="whitespace-nowrap px-3 py-2">{formatCurrency(s.studentLoans)}</td>
                        <td className="whitespace-nowrap px-3 py-2">{formatCurrency(s.personalLoans)}</td>
                        <td className="whitespace-nowrap px-3 py-2 font-medium text-green-600 dark:text-green-400">
                          {formatCurrency(s.totalAssets)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 font-medium text-red-600 dark:text-red-400">
                          {formatCurrency(s.totalLiabilities)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 font-semibold">
                          {formatCurrency(s.netWorth)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 font-medium">
                          {s.delta === undefined ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <span
                              className={
                                s.delta > 0
                                  ? "text-green-600 dark:text-green-400"
                                  : s.delta < 0
                                  ? "text-red-600 dark:text-red-400"
                                  : "text-muted-foreground"
                              }
                            >
                              {s.delta > 0 ? "+" : ""}
                              {formatCurrency(s.delta)}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t px-4 py-3">
                  <span className="text-sm text-muted-foreground">
                    Page {page} of {totalPages} ({total} total)
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
