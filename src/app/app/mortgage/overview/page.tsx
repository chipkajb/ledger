"use client";

import { useState, useEffect } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { format } from "date-fns";
import type { AmortizationRow, MortgageSummary } from "@/lib/mortgage";

interface MortgageData {
  id: number;
  label: string;
  name: string;
  isActive: boolean;
  active: boolean;
  schedule: AmortizationRow[];
  summary: MortgageSummary;
}

function formatCurrencyShort(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

const TODAY = format(new Date(), "yyyy-MM-dd");

export default function MortgageOverviewPage() {
  const [mortgages, setMortgages] = useState<MortgageData[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/mortgage");
        if (res.ok) {
          const data: MortgageData[] = await res.json();
          setMortgages(data);
          const active = data.find((m) => m.active) ?? data[0];
          if (active) setSelectedId(String(active.id));
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const mortgage = mortgages.find((m) => String(m.id) === selectedId);
  const { schedule = [], summary } = mortgage ?? {};

  // Build balance-over-time chart data (sample every few rows for performance)
  const sampleStep = Math.max(1, Math.floor((schedule.length) / 120));
  const balanceChartData = schedule
    .filter((_, i) => i % sampleStep === 0 || i === schedule.length - 1)
    .map((row) => ({
      date: row.date,
      balance: row.endingBalance,
      isPast: row.date <= TODAY,
    }));

  const pastBalanceData = balanceChartData.filter((d) => d.isPast);
  const futureBalanceData = balanceChartData.filter((d) => !d.isPast);

  // Pie: principal vs interest for remaining payments
  const remainingRows = schedule.filter((r) => r.date > TODAY);
  const remainingPrincipal = remainingRows.reduce((s, r) => s + r.principal, 0);
  const remainingInterest = remainingRows.reduce((s, r) => s + r.interest, 0);

  const pieData = [
    { name: "Principal", value: Math.round(remainingPrincipal), color: "#3b82f6" },
    { name: "Interest", value: Math.round(remainingInterest), color: "#ef4444" },
  ];

  const equityPct = summary?.currentEquityPct ?? 0;

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="h-72 animate-pulse rounded-xl bg-muted" />
          <div className="h-72 animate-pulse rounded-xl bg-muted" />
        </div>
      </div>
    );
  }

  if (!mortgage || !summary) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Mortgage Overview</h1>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No mortgage data found. Please configure your mortgage in Settings.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Mortgage Overview</h1>
          <p className="text-muted-foreground">Summary and projections for your mortgage.</p>
        </div>
        {mortgages.length > 1 && (
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Select mortgage" />
            </SelectTrigger>
            <SelectContent>
              {mortgages.map((m) => (
                <SelectItem key={m.id} value={String(m.id)}>
                  {m.name ?? m.label}
                  {m.active ? " (Active)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-l-4 border-l-amber-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Current Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{formatCurrency(summary.currentBalance)}</div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-emerald-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Home Equity ($)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {formatCurrency(summary.currentEquity)}
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-emerald-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Home Equity (%)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {formatPercent(summary.currentEquityPct)}
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Monthly Payment (P&I)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{formatCurrency(summary.monthlyPayment)}</div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Monthly Total (w/ Escrow)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{formatCurrency(summary.totalMonthlyPayment)}</div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-violet-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Payoff Date
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-violet-600 dark:text-violet-400">
              {summary.payoffDate
                ? format(new Date(summary.payoffDate + "T00:00:00"), "MMM yyyy")
                : "—"}
            </div>
            {summary.monthsSaved > 0 && (
              <div className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
                {summary.monthsSaved} months early
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-emerald-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Interest Saved
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {formatCurrency(summary.moneySaved)}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">from extra payments</div>
          </CardContent>
        </Card>
      </div>

      {/* Equity Gauge */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Equity Progress</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">0%</span>
              <span className="font-semibold">{formatPercent(equityPct)} equity</span>
              <span className="text-muted-foreground">100%</span>
            </div>
            <div className="h-6 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-500 to-green-500 transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, equityPct))}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{formatCurrency(summary.currentEquity)} equity</span>
              <span>{formatCurrency(summary.currentBalance)} remaining</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Area chart: remaining balance over time */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Remaining Balance Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="date"
                  type="category"
                  allowDuplicatedCategory={false}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => format(new Date(v + "T00:00:00"), "MMM yy")}
                />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={formatCurrencyShort} width={64} />
                <Tooltip
                  formatter={(v: number) => formatCurrency(v)}
                  labelFormatter={(l) => `Date: ${l}`}
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    color: "hsl(var(--card-foreground))",
                  }}
                  labelStyle={{ color: "hsl(var(--foreground))" }}
                  itemStyle={{ color: "hsl(var(--card-foreground))" }}
                />
                {/* Past payments — solid */}
                <Area
                  data={pastBalanceData}
                  type="monotone"
                  dataKey="balance"
                  name="Balance (Past)"
                  stroke="#3b82f6"
                  fill="#3b82f6"
                  fillOpacity={0.3}
                  dot={false}
                />
                {/* Future payments — greyed */}
                <Area
                  data={futureBalanceData}
                  type="monotone"
                  dataKey="balance"
                  name="Balance (Future)"
                  stroke="#94a3b8"
                  fill="#94a3b8"
                  fillOpacity={0.15}
                  strokeDasharray="4 2"
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Pie: Principal vs Interest breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Remaining Payments: Principal vs Interest</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart margin={{ top: 20, right: 30, bottom: 20, left: 30 }}>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={100}
                  paddingAngle={3}
                  dataKey="value"
                  label={({ name, percent }) =>
                    `${name} ${(percent * 100).toFixed(1)}%`
                  }
                  labelLine={false}
                >
                  {pieData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: number) => formatCurrency(v)}
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    color: "hsl(var(--card-foreground))",
                  }}
                  labelStyle={{ color: "hsl(var(--foreground))" }}
                  itemStyle={{ color: "hsl(var(--card-foreground))" }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex gap-6 text-sm">
              {pieData.map((d) => (
                <div key={d.name} className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-sm" style={{ background: d.color }} />
                  <span className="text-muted-foreground">{d.name}:</span>
                  <span className="font-medium">{formatCurrency(d.value)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
