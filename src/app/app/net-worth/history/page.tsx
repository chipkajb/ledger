"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
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
  ReferenceLine,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ExportButton } from "@/components/ui/export-button";
import { ImportDialog } from "@/components/ui/import-dialog";
import { formatCurrency } from "@/lib/utils";
import { format, subYears } from "date-fns";
import { Copy, Check, Pencil, X, Save } from "lucide-react";

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

const LIABILITY_COLORS: Record<string, string> = {
  mortgageBalance: "#ef4444",
  studentLoans: "#f97316",
  personalLoans: "#eab308",
};

const LIABILITY_LABELS: Record<string, string> = {
  mortgageBalance: "Mortgage",
  studentLoans: "Student Loans",
  personalLoans: "Personal Loans",
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
  payload?: Array<{ value: number; dataKey: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const deltaEntry = payload.find((p) => p.dataKey === "delta");
  const avgEntry = payload.find((p) => p.dataKey === "rollingAvg");
  const delta = deltaEntry?.value ?? 0;
  const avg = avgEntry?.value;
  const color = delta > 0 ? "#22c55e" : delta < 0 ? "#ef4444" : "#6b7280";
  return (
    <div
      className="rounded-lg p-2 text-sm shadow-md"
      style={TOOLTIP_CONTENT_STYLE}
    >
      <p className="mb-1 font-medium" style={TOOLTIP_LABEL_STYLE}>
        {label ? format(new Date(label + "T00:00:00"), "MMM d, yyyy") : ""}
      </p>
      <p style={{ color }}>
        Change: {delta > 0 ? "+" : ""}
        {formatCurrency(delta)}
      </p>
      {avg !== undefined && (
        <p style={{ color: "#60a5fa" }}>
          4-wk avg: {avg > 0 ? "+" : ""}
          {formatCurrency(avg)}
        </p>
      )}
    </div>
  );
}

function NetWorthTooltip({
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
  const color = value < 0 ? "#ef4444" : "#22c55e";
  return (
    <div className="rounded-lg p-2 text-sm shadow-md" style={TOOLTIP_CONTENT_STYLE}>
      <p className="mb-1" style={TOOLTIP_LABEL_STYLE}>
        {label ? format(new Date(label + "T00:00:00"), "MMM d, yyyy") : ""}
      </p>
      <p style={{ color }}>
        Net Worth: {formatCurrency(value)}
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
  // Asset/liability breakdown field visibility
  const [hiddenAssets, setHiddenAssets] = useState<Set<string>>(new Set());
  const [hiddenLiabilities, setHiddenLiabilities] = useState<Set<string>>(new Set());
  // Whether the breakdown chart shows assets or liabilities
  const [breakdownMode, setBreakdownMode] = useState<"assets" | "liabilities">("assets");
  // Delta chart Y-axis manual bounds (empty string = auto)
  const [deltaYMin, setDeltaYMin] = useState("");
  const [deltaYMax, setDeltaYMax] = useState("");

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

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<Snapshot>>({});
  const [saving, setSaving] = useState(false);

  function handleStartEdit(s: Snapshot) {
    setEditingId(s.id);
    setEditValues({
      snapshotDate: s.snapshotDate,
      checking: s.checking,
      savings: s.savings,
      homeEquity: s.homeEquity,
      retirement401k: s.retirement401k,
      hsaHra: s.hsaHra,
      investments: s.investments,
      plan529: s.plan529,
      teamworksEquity: s.teamworksEquity,
      mortgageBalance: s.mortgageBalance,
      studentLoans: s.studentLoans,
      personalLoans: s.personalLoans,
    });
  }

  function handleCancelEdit() {
    setEditingId(null);
    setEditValues({});
  }

  async function handleSaveEdit() {
    if (!editingId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/net-worth/snapshots", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingId, ...editValues }),
      });
      if (!res.ok) throw new Error("Save failed");
      setEditingId(null);
      setEditValues({});
      loadTable();
      loadCharts();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function setEditField(field: keyof Snapshot, value: string) {
    const numericFields = [
      "checking", "savings", "homeEquity", "retirement401k", "hsaHra",
      "investments", "plan529", "teamworksEquity", "mortgageBalance",
      "studentLoans", "personalLoans",
    ];
    setEditValues((prev) => ({
      ...prev,
      [field]: numericFields.includes(field) ? (value === "" ? 0 : parseFloat(value)) : value,
    }));
  }

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

  function toggleLiability(key: string) {
    setHiddenLiabilities((prev) => {
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

  // 4-point trailing rolling average (approx 4 weeks for monthly snapshots)
  const ROLLING_WINDOW = 4;
  const deltaDataWithAvg = deltaData.map((d, i) => {
    const slice = deltaData.slice(Math.max(0, i - ROLLING_WINDOW + 1), i + 1);
    const avg = slice.reduce((sum, x) => sum + x.delta, 0) / slice.length;
    return { ...d, rollingAvg: avg };
  });

  // Y-axis domain: manual overrides if set, otherwise 5th–95th percentile
  const deltaDomain = useMemo(() => {
    const manualMin = deltaYMin !== "" ? parseFloat(deltaYMin) : null;
    const manualMax = deltaYMax !== "" ? parseFloat(deltaYMax) : null;
    const hasManualMin = manualMin !== null && !isNaN(manualMin);
    const hasManualMax = manualMax !== null && !isNaN(manualMax);
    if (hasManualMin && hasManualMax) {
      return [manualMin, manualMax] as [number, number];
    }
    if (deltaData.length < 2) {
      return [hasManualMin ? manualMin : "auto", hasManualMax ? manualMax : "auto"] as [(number | string), (number | string)];
    }
    const vals = [...deltaData].map((d) => d.delta).sort((a, b) => a - b);
    const n = vals.length;
    const p5 = vals[Math.max(0, Math.floor(n * 0.05))];
    const p95 = vals[Math.min(n - 1, Math.floor(n * 0.95))];
    const pad = Math.abs(p95 - p5) * 0.3 || 5000;
    const lo = Math.floor((p5 - pad) / 1000) * 1000;
    const hi = Math.ceil((p95 + pad) / 1000) * 1000;
    return [
      hasManualMin ? manualMin : Math.min(lo, 0),
      hasManualMax ? manualMax : Math.max(hi, 0),
    ] as [number, number];
  }, [deltaData, deltaYMin, deltaYMax]);

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
  const visibleLiabilities = Object.keys(LIABILITY_COLORS).filter((k) => !hiddenLiabilities.has(k));

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
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => format(new Date(v + "T00:00:00"), "MMM yy")} />
                    <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={formatCurrencyShort} width={64} />
                    <Tooltip content={<NetWorthTooltip />} />
                    <Line type="monotone" dataKey="netWorth" name="Net Worth" stroke="#3b82f6" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-base">
                  {breakdownMode === "assets" ? "Asset" : "Liability"} Breakdown Over Time
                </CardTitle>
                {/* Assets / Liabilities segmented control */}
                <div className="flex rounded-md border text-xs overflow-hidden">
                  <button
                    onClick={() => setBreakdownMode("assets")}
                    className={`px-3 py-1 font-medium transition-colors ${
                      breakdownMode === "assets"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Assets
                  </button>
                  <button
                    onClick={() => setBreakdownMode("liabilities")}
                    className={`px-3 py-1 font-medium transition-colors border-l ${
                      breakdownMode === "liabilities"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Liabilities
                  </button>
                </div>
              </CardHeader>
              <CardContent>
                {/* Field toggles */}
                <div className="flex flex-wrap gap-1 mb-3">
                  {breakdownMode === "assets"
                    ? Object.keys(ASSET_COLORS).map((key) => {
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
                      })
                    : Object.keys(LIABILITY_COLORS).map((key) => {
                        const hidden = hiddenLiabilities.has(key);
                        return (
                          <button
                            key={key}
                            onClick={() => toggleLiability(key)}
                            className="px-2 py-0.5 rounded text-xs font-medium transition-opacity"
                            style={{
                              backgroundColor: hidden ? "transparent" : LIABILITY_COLORS[key] + "33",
                              color: LIABILITY_COLORS[key],
                              border: `1px solid ${LIABILITY_COLORS[key]}`,
                              opacity: hidden ? 0.4 : 1,
                            }}
                          >
                            {LIABILITY_LABELS[key]}
                          </button>
                        );
                      })}
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={chartEnriched} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => format(new Date(v + "T00:00:00"), "MMM yy")} />
                    <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={formatCurrencyShort} width={64} />
                    <Tooltip
                      formatter={(v: number, name: string) => [formatCurrency(v), name]}
                      labelFormatter={(l) => format(new Date(l + "T00:00:00"), "MMM d, yyyy")}
                      contentStyle={TOOLTIP_CONTENT_STYLE}
                      labelStyle={TOOLTIP_LABEL_STYLE}
                    />
                    <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                    {breakdownMode === "assets"
                      ? visibleAssets.map((key) => (
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
                        ))
                      : visibleLiabilities.map((key) => (
                          <Area
                            key={key}
                            type="monotone"
                            dataKey={key}
                            name={LIABILITY_LABELS[key]}
                            stackId="liabilities"
                            stroke={LIABILITY_COLORS[key]}
                            fill={LIABILITY_COLORS[key]}
                            fillOpacity={0.7}
                          />
                        ))}
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-base">Snapshot-over-Snapshot Delta</CardTitle>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Y-axis:</span>
                    <Input
                      type="number"
                      placeholder="Min"
                      value={deltaYMin}
                      onChange={(e) => setDeltaYMin(e.target.value)}
                      className="h-7 w-24 text-xs"
                    />
                    <span>to</span>
                    <Input
                      type="number"
                      placeholder="Max"
                      value={deltaYMax}
                      onChange={(e) => setDeltaYMax(e.target.value)}
                      className="h-7 w-24 text-xs"
                    />
                    {(deltaYMin !== "" || deltaYMax !== "") && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => { setDeltaYMin(""); setDeltaYMax(""); }}
                      >
                        Reset
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <ComposedChart data={deltaDataWithAvg} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      tickFormatter={(v) => format(new Date(v + "T00:00:00"), "MMM yy")}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      tickFormatter={formatCurrencyShort}
                      width={64}
                      domain={deltaDomain}
                      allowDataOverflow={true}
                    />
                    <Tooltip content={<DeltaTooltip />} />
                    <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={1} />
                    <Bar dataKey="delta" name="Change" radius={[2, 2, 0, 0]}>
                      {deltaDataWithAvg.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.delta >= 0 ? "#22c55e44" : "#ef444444"}
                          stroke={entry.delta >= 0 ? "#22c55e" : "#ef4444"}
                          strokeWidth={1}
                        />
                      ))}
                    </Bar>
                    <Line
                      type="monotone"
                      dataKey="rollingAvg"
                      name="4-wk Avg"
                      stroke="#60a5fa"
                      strokeWidth={2.5}
                      dot={false}
                      legendType="none"
                    />
                  </ComposedChart>
                </ResponsiveContainer>
                <p className="mt-1 text-xs text-muted-foreground text-center">
                  <span style={{ color: "#60a5fa" }}>&#8212;</span> 4-week rolling average &nbsp;&middot;&nbsp; set Y-axis min/max above to clip outliers
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Assets vs Liabilities Over Time</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={chartEnriched} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                    <defs>
                      <linearGradient id="assetsGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.03} />
                      </linearGradient>
                      <linearGradient id="liabilitiesGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0.03} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      tickFormatter={(v) => format(new Date(v + "T00:00:00"), "MMM yy")}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      tickFormatter={formatCurrencyShort}
                      width={64}
                    />
                    <Tooltip
                      formatter={(v: number, name: string) => [formatCurrency(v), name]}
                      labelFormatter={(l) => format(new Date(l + "T00:00:00"), "MMM d, yyyy")}
                      contentStyle={TOOLTIP_CONTENT_STYLE}
                      labelStyle={TOOLTIP_LABEL_STYLE}
                    />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }} />
                    <Area
                      type="monotone"
                      dataKey="totalAssets"
                      name="Total Assets"
                      stroke="#10b981"
                      strokeWidth={2}
                      fill="url(#assetsGradient)"
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="totalLiabilities"
                      name="Total Liabilities"
                      stroke="#ef4444"
                      strokeWidth={2}
                      fill="url(#liabilitiesGradient)"
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  </AreaChart>
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
                    {tableEnriched.map((s, i) => {
                      const isEditing = editingId === s.id;
                      return (
                        <tr key={s.id ?? i} className={`border-b last:border-0 group ${isEditing ? "bg-muted/40" : "hover:bg-muted/30"}`}>
                          {isEditing ? (
                            <>
                              <td className="whitespace-nowrap px-2 py-1">
                                <Input
                                  type="date"
                                  value={editValues.snapshotDate ?? ""}
                                  onChange={(e) => setEditField("snapshotDate", e.target.value)}
                                  className="h-7 w-36 text-xs"
                                />
                              </td>
                              {(["checking", "savings", "homeEquity", "retirement401k", "hsaHra", "investments", "plan529", "teamworksEquity", "mortgageBalance", "studentLoans", "personalLoans"] as (keyof Snapshot)[]).map((field) => (
                                <td key={field} className="whitespace-nowrap px-2 py-1">
                                  <Input
                                    type="number"
                                    step="0.01"
                                    value={editValues[field] ?? ""}
                                    onChange={(e) => setEditField(field, e.target.value)}
                                    onKeyDown={(e) => { if (e.key === "Enter") handleSaveEdit(); if (e.key === "Escape") handleCancelEdit(); }}
                                    className="h-7 w-28 text-xs"
                                  />
                                </td>
                              ))}
                              {/* Computed columns — read-only while editing */}
                              <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">auto</td>
                              <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">auto</td>
                              <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">auto</td>
                              <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">—</td>
                              <td className="px-2 py-1">
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={handleSaveEdit}
                                    disabled={saving}
                                    className="text-green-600 hover:text-green-800 disabled:opacity-50"
                                    title="Save"
                                  >
                                    <Save className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={handleCancelEdit}
                                    className="text-muted-foreground hover:text-foreground"
                                    title="Cancel"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </td>
                            </>
                          ) : (
                            <>
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
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => handleStartEdit(s)}
                                    className="text-muted-foreground hover:text-foreground"
                                    title="Edit snapshot"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteSnapshot(s.id)}
                                    className="text-xs text-red-500 hover:text-red-700"
                                    title="Delete snapshot"
                                  >
                                    ✕
                                  </button>
                                </div>
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
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
