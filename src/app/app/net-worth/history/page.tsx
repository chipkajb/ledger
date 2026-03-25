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
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ExportButton } from "@/components/ui/export-button";
import { ImportDialog } from "@/components/ui/import-dialog";
import { formatCurrency } from "@/lib/utils";
import { format, subYears } from "date-fns";
import { Copy, Check } from "lucide-react";

interface Snapshot {
  id: string;
  snapshotDate: string;
  checking: number;
  savings: number;
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
  delta?: number | null;
}

type EnrichedSnapshot = Snapshot & {
  date: string;
};

interface PaginatedResponse {
  snapshots: Snapshot[];
  total: number;
  page: number;
  limit: number;
}

const ASSET_COLORS: Record<string, string> = {
  checking: "#3b82f6",
  savings: "#10b981",
  homeEquity: "#f59e0b",
  retirement401k: "#8b5cf6",
  hsaHra: "#ec4899",
  investments: "#06b6d4",
  plan529: "#84cc16",
  teamworksEquity: "#f97316",
};

const ASSET_LABELS: Record<string, string> = {
  checking: "Checking",
  savings: "Savings",
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

function todayStr() { return format(new Date(), "yyyy-MM-dd"); }
function oneYearAgoStr() { return format(subYears(new Date(), 1), "yyyy-MM-dd"); }
function fiveYearsAgoStr() { return format(subYears(new Date(), 5), "yyyy-MM-dd"); }

const TOOLTIP_CONTENT_STYLE = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
  color: "hsl(var(--card-foreground))",
};
const TOOLTIP_LABEL_STYLE = { color: "hsl(var(--foreground))" };

function DeltaTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const value = payload[0].value;
  const color = value > 0 ? "#22c55e" : value < 0 ? "#ef4444" : "#6b7280";
  return (
    <div
      className="rounded-lg p-2 text-sm shadow-md"
      style={TOOLTIP_CONTENT_STYLE}
    >
      <p className="mb-1" style={TOOLTIP_LABEL_STYLE}>
        {label ? format(new Date(label + "T00:00:00"), "MMM d, yyyy") : ""}
      </p>
      <p style={{ color }}>
        Change: {value > 0 ? "+" : ""}
        {formatCurrency(value)}
      </p>
    </div>
  );
}

export default function NetWorthHistoryPage() {
  const [from, setFrom] = useState("2023-01-01");
  const [to, setTo] = useState(todayStr());
  // Table data (paginated)
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  // Chart data (all snapshots in date range)
  const [allSnapshots, setAllSnapshots] = useState<Snapshot[]>([]);
  // Asset breakdown field visibility
  const [hiddenAssets, setHiddenAssets] = useState<Set<string>>(new Set());

  const LIMIT = 50;

  const loadTable = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ from, to, page: page.toString(), limit: LIMIT.toString() });
      const res = await fetch(`/api/net-worth/snapshots?${params}`);
      if (res.ok) {
        const json: PaginatedResponse = await res.json();
        setSnapshots(json.snapshots ?? []);
        setTotal(json.total ?? 0);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [from, to, page]);

  const loadCharts = useCallback(async () => {
    try {
      const params = new URLSearchParams({ from, to, page: "1", limit: "10000" });
      const res = await fetch(`/api/net-worth/snapshots?${params}`);
      if (res.ok) {
        const json: PaginatedResponse = await res.json();
        // Reverse to chronological (oldest → newest) order for charts
        setAllSnapshots([...(json.snapshots ?? [])].reverse());
      }
    } catch { /* ignore */ }
  }, [from, to]);

  useEffect(() => { loadTable(); }, [loadTable]);
  useEffect(() => { loadCharts(); }, [loadCharts]);

  const [copiedCol, setCopiedCol] = useState<string | null>(null);

  function copyColumn(key: keyof Snapshot, label: string) {
    const lines = snapshots.map((s) => `${s.snapshotDate}\t${(s[key] as number).toFixed(2)}`);
    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      setCopiedCol(label);
      setTimeout(() => setCopiedCol(null), 1500);
    });
  }

  function toggleAsset(key: string) {
    setHiddenAssets((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Chart data: all snapshots in ascending (chronological) order
  const chartEnriched: EnrichedSnapshot[] = allSnapshots.map((s) => ({ ...s, date: s.snapshotDate }));
  const deltaData = chartEnriched
    .filter((s) => s.delta !== null && s.delta !== undefined)
    .map((s) => ({ date: s.date, delta: s.delta ?? 0 }));

  // Table data: paginated, newest first
  const tableEnriched: EnrichedSnapshot[] = snapshots.map((s) => ({ ...s, date: s.snapshotDate }));

  const totalPages = Math.ceil(total / LIMIT);

  async function handleDeleteSnapshot(id: string) {
    if (!confirm("Delete this snapshot?")) return;
    try {
      const res = await fetch(`/api/net-worth/snapshots?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      loadTable();
      loadCharts();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Delete failed");
    }
  }

  function handleDatePreset(newFrom: string) {
    setFrom(newFrom);
    setTo(todayStr());
    setPage(1);
  }

  const visibleAssets = Object.keys(ASSET_COLORS).filter((k) => !hiddenAssets.has(k));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Net Worth History</h1>
          <p className="text-muted-foreground">Charts and full history of your net worth snapshots.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ImportDialog
            apiUrl="/api/import/net-worth"
            title="Import Net Worth Snapshots"
            description="Upload a CSV or Excel file. Expected columns: Date, Checking, Savings, Home Equity, 401K, HSA/HRA, Investments, 529 Plan, Teamworks, Mortgage Balance, Student Loans, Personal Loans."
            templateUrl="/templates/net-worth-template.csv"
            triggerLabel="Import CSV/XLSX"
            onSuccess={() => { loadTable(); loadCharts(); }}
          />
          <ExportButton
            baseUrl="/api/export/net-worth"
            params={{ from, to }}
            label="Export"
          />
        </div>
      </div>

      {/* Date range picker */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 pt-6">
          <div className="space-y-1">
            <label className="text-sm font-medium">From</label>
            <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="w-40" />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">To</label>
            <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="w-40" />
          </div>
          <Button variant="outline" onClick={() => handleDatePreset(oneYearAgoStr())}>
            Last 12 Months
          </Button>
          <Button variant="outline" onClick={() => handleDatePreset(fiveYearsAgoStr())}>
            Last 5 Years
          </Button>
          <Button variant="outline" onClick={() => handleDatePreset("2000-01-01")}>
            All Time
          </Button>
        </CardContent>
      </Card>

      {loading ? (
        <div className="grid gap-6 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-72 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : allSnapshots.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No snapshots found for this date range.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Charts */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Net Worth Over Time</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={chartEnriched} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => format(new Date(v + "T00:00:00"), "MMM yy")} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={formatCurrencyShort} width={64} />
                    <Tooltip
                      formatter={(v: number) => [formatCurrency(v), "Net Worth"]}
                      labelFormatter={(l) => format(new Date(l + "T00:00:00"), "MMM d, yyyy")}
                      contentStyle={TOOLTIP_CONTENT_STYLE}
                      labelStyle={TOOLTIP_LABEL_STYLE}
                    />
                    <Line type="monotone" dataKey="netWorth" name="Net Worth" stroke="#3b82f6" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Asset Breakdown Over Time</CardTitle>
              </CardHeader>
              <CardContent>
                {/* Field toggles */}
                <div className="flex flex-wrap gap-1 mb-3">
                  {Object.keys(ASSET_COLORS).map((key) => {
                    const hidden = hiddenAssets.has(key);
                    return (
                      <button
                        key={key}
                        onClick={() => toggleAsset(key)}
                        className="px-2 py-0.5 rounded text-xs font-medium transition-opacity"
                        style={{
                          backgroundColor: hidden ? "transparent" : ASSET_COLORS[key] + "33",
                          color: ASSET_COLORS[key],
                          border: `1px solid ${ASSET_COLORS[key]}`,
                          opacity: hidden ? 0.4 : 1,
                        }}
                      >
                        {ASSET_LABELS[key]}
                      </button>
                    );
                  })}
                </div>
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={chartEnriched} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => format(new Date(v + "T00:00:00"), "MMM yy")} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={formatCurrencyShort} width={64} />
                    <Tooltip
                      formatter={(v: number, name: string) => [formatCurrency(v), name]}
                      labelFormatter={(l) => format(new Date(l + "T00:00:00"), "MMM d, yyyy")}
                      contentStyle={TOOLTIP_CONTENT_STYLE}
                      labelStyle={TOOLTIP_LABEL_STYLE}
                    />
                    <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                    {visibleAssets.map((key) => (
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

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Snapshot-over-Snapshot Delta</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={deltaData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => format(new Date(v + "T00:00:00"), "MMM yy")} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={formatCurrencyShort} width={64} />
                    <Tooltip content={<DeltaTooltip />} />
                    <Bar dataKey="delta" name="Change" radius={[2, 2, 0, 0]}>
                      {deltaData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.delta >= 0 ? "#22c55e" : "#ef4444"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Assets vs Liabilities Over Time</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={chartEnriched} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => format(new Date(v + "T00:00:00"), "MMM yy")} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={formatCurrencyShort} width={64} />
                    <Tooltip
                      formatter={(v: number, name: string) => [formatCurrency(v), name]}
                      labelFormatter={(l) => format(new Date(l + "T00:00:00"), "MMM d, yyyy")}
                      contentStyle={TOOLTIP_CONTENT_STYLE}
                      labelStyle={TOOLTIP_LABEL_STYLE}
                    />
                    <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="totalAssets" name="Total Assets" stackId="a" fill="#10b981" />
                    <Bar dataKey="totalLiabilities" name="Total Liabilities" stackId="b" fill="#ef4444" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* History Table */}
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">Snapshot History</CardTitle>
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">
                  {total} snapshot{total !== 1 ? "s" : ""}
                </span>
                <ExportButton
                  baseUrl="/api/export/net-worth"
                  params={{ from, to }}
                  label="Export"
                  size="sm"
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="whitespace-nowrap px-3 py-2 text-left font-medium text-muted-foreground">Date</th>
                      {([
                        { label: "Checking", key: "checking" as keyof Snapshot },
                        { label: "Savings", key: "savings" as keyof Snapshot },
                        { label: "Home Equity", key: "homeEquity" as keyof Snapshot },
                        { label: "401K", key: "retirement401k" as keyof Snapshot },
                        { label: "HSA/HRA", key: "hsaHra" as keyof Snapshot },
                        { label: "Investments", key: "investments" as keyof Snapshot },
                        { label: "529 Plan", key: "plan529" as keyof Snapshot },
                        { label: "Teamworks", key: "teamworksEquity" as keyof Snapshot },
                        { label: "Mortgage", key: "mortgageBalance" as keyof Snapshot },
                        { label: "Student Loans", key: "studentLoans" as keyof Snapshot },
                        { label: "Personal Loans", key: "personalLoans" as keyof Snapshot },
                        { label: "Total Assets", key: "totalAssets" as keyof Snapshot },
                        { label: "Total Liabilities", key: "totalLiabilities" as keyof Snapshot },
                        { label: "Net Worth", key: "netWorth" as keyof Snapshot },
                      ] as { label: string; key: keyof Snapshot }[]).map(({ label, key }) => (
                        <th key={label} className="whitespace-nowrap px-3 py-2 text-left font-medium text-muted-foreground">
                          <span className="flex items-center gap-1 group">
                            {label}
                            <button
                              onClick={() => copyColumn(key, label)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:text-foreground"
                              title={`Copy ${label} column`}
                            >
                              {copiedCol === label ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                            </button>
                          </span>
                        </th>
                      ))}
                      <th className="whitespace-nowrap px-3 py-2 text-left font-medium text-muted-foreground">Delta</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {tableEnriched.map((s, i) => (
                      <tr key={s.id ?? i} className="border-b last:border-0 hover:bg-muted/30 group">
                        <td className="whitespace-nowrap px-3 py-2 font-medium">{s.snapshotDate}</td>
                        <td className="whitespace-nowrap px-3 py-2">{formatCurrency(s.checking)}</td>
                        <td className="whitespace-nowrap px-3 py-2">{formatCurrency(s.savings)}</td>
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
                        <td className="whitespace-nowrap px-3 py-2 font-semibold">{formatCurrency(s.netWorth)}</td>
                        <td className="whitespace-nowrap px-3 py-2 font-medium">
                          {s.delta === undefined || s.delta === null ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <span className={s.delta > 0 ? "text-green-600 dark:text-green-400" : s.delta < 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}>
                              {s.delta > 0 ? "+" : ""}{formatCurrency(s.delta)}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleDeleteSnapshot(s.id)}
                            className="text-xs text-red-500 hover:text-red-700"
                            title="Delete snapshot"
                          >
                            ✕
                          </button>
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
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                      Previous
                    </Button>
                    <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
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
