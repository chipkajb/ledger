"use client";

import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatPercent, currentMonth, isoToMonthLabel } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────

interface NetWorthLatest {
  current: {
    id: number;
    snapshotDate: string;
    netWorth: number;
    totalAssets: number;
    totalLiabilities: number;
  } | null;
  previous: {
    netWorth: number;
  } | null;
  delta: number | null;
}

interface BudgetSummary {
  month: string;
  totalIncome: number;
  totalExpenses: number;
  totalFunds: number;
  netGain: number;
  categories: {
    id: number;
    name: string;
    parentCategory: string;
    isIncomeSource: boolean;
    isFunds: boolean;
    actual: number;
  }[];
}

interface MortgageData {
  active: {
    id: number;
    loanAmount: number;
    housePrice: number;
    downPayment: number;
    annualRate: number;
    termYears: number;
  } | null;
  summary: {
    currentBalance: number;
    equityPercent: number;
    totalPaid: number;
    payoffDate: string;
  } | null;
}

interface NetWorthSnapshot {
  id: number;
  snapshotDate: string;
  netWorth: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const START_YEAR = 2023;

function buildMonthOptionsByYear(): Array<{ year: string; months: string[] }> {
  const now = new Date();
  const currentYear = now.getFullYear();
  const result: Array<{ year: string; months: string[] }> = [];

  for (let y = currentYear; y >= START_YEAR; y--) {
    const maxMonth = y === currentYear ? now.getMonth() + 1 : 12;
    const months: string[] = [];
    for (let m = maxMonth; m >= 1; m--) {
      months.push(`${y}-${String(m).padStart(2, "0")}`);
    }
    if (months.length > 0) result.push({ year: String(y), months });
  }
  return result;
}

// ── Skeleton components ────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="h-4 w-28 animate-pulse rounded bg-muted" />
      </CardHeader>
      <CardContent>
        <div className="h-8 w-36 animate-pulse rounded bg-muted mb-2" />
        <div className="h-3 w-24 animate-pulse rounded bg-muted" />
      </CardContent>
    </Card>
  );
}

function SkeletonChart() {
  return (
    <div className="h-48 w-full animate-pulse rounded bg-muted" />
  );
}

// ── Dashboard Page ─────────────────────────────────────────────────────────

export default function DashboardPage() {
  const monthOptionsByYear = buildMonthOptionsByYear();
  const [selectedMonth, setSelectedMonth] = useState(currentMonth());

  const [netWorthData, setNetWorthData] = useState<NetWorthLatest | null>(null);
  const [budgetData, setBudgetData] = useState<BudgetSummary | null>(null);
  const [mortgageData, setMortgageData] = useState<MortgageData | null>(null);
  const [snapshots, setSnapshots] = useState<NetWorthSnapshot[]>([]);

  const [loadingNetWorth, setLoadingNetWorth] = useState(true);
  const [loadingBudget, setLoadingBudget] = useState(true);
  const [loadingMortgage, setLoadingMortgage] = useState(true);
  const [loadingSnapshots, setLoadingSnapshots] = useState(true);

  useEffect(() => {
    fetch("/api/net-worth/latest")
      .then((r) => r.json())
      .then(setNetWorthData)
      .catch(console.error)
      .finally(() => setLoadingNetWorth(false));

    fetch("/api/mortgage")
      .then((r) => r.json())
      .then(setMortgageData)
      .catch(console.error)
      .finally(() => setLoadingMortgage(false));

    fetch("/api/net-worth/snapshots?limit=20")
      .then((r) => r.json())
      .then((d) => setSnapshots((d.snapshots ?? []).reverse()))
      .catch(console.error)
      .finally(() => setLoadingSnapshots(false));
  }, []);

  useEffect(() => {
    setLoadingBudget(true);
    fetch(`/api/budget/summary?month=${selectedMonth}`)
      .then((r) => r.json())
      .then(setBudgetData)
      .catch(console.error)
      .finally(() => setLoadingBudget(false));
  }, [selectedMonth]);

  // ── Derived values ────────────────────────────────────────────────────

  const netWorthDelta = netWorthData?.delta ?? null;
  const deltaPositive = netWorthDelta != null && netWorthDelta >= 0;

  const mortgageSummary = mortgageData?.summary ?? null;
  const equityPct = mortgageSummary?.equityPercent ?? null;

  // Bar chart data: top 8 expense categories by actual spend
  const categoryChartData = (budgetData?.categories ?? [])
    .filter((c) => !c.isIncomeSource && !c.isFunds && c.actual > 0)
    .sort((a, b) => b.actual - a.actual)
    .slice(0, 8)
    .map((c) => ({
      name: c.name.length > 12 ? c.name.slice(0, 11) + "…" : c.name,
      Actual: c.actual,
    }));

  // Mortgage area chart: first 24 months of schedule from snapshots proxy
  const mortgageChartData: { month: string; Balance: number }[] = [];
  if (mortgageData?.active && mortgageSummary) {
    const rate = mortgageData.active.annualRate / 100 / 12;
    const n = mortgageData.active.termYears * 12;
    const P = mortgageData.active.loanAmount;
    const payment = rate > 0 ? (P * rate * Math.pow(1 + rate, n)) / (Math.pow(1 + rate, n) - 1) : P / n;
    let balance = mortgageSummary.currentBalance;
    for (let i = 0; i < 24; i++) {
      const interestPayment = balance * rate;
      const principalPayment = payment - interestPayment;
      balance = Math.max(0, balance - principalPayment);
      mortgageChartData.push({ month: `M+${i + 1}`, Balance: Math.round(balance) });
      if (balance <= 0) break;
    }
  }

  const snapshotChartData = snapshots.map((s) => ({
    date: s.snapshotDate.slice(0, 7),
    "Net Worth": s.netWorth,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground text-sm">{isoToMonthLabel(selectedMonth)}</p>
        </div>
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Select month" />
          </SelectTrigger>
          <SelectContent>
            {monthOptionsByYear.map(({ year, months }) => (
              <SelectGroup key={year}>
                <SelectLabel>{year}</SelectLabel>
                {months.map((m) => (
                  <SelectItem key={m} value={m}>
                    {isoToMonthLabel(m)}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">

        {/* Net Worth */}
        {loadingNetWorth ? (
          <SkeletonCard />
        ) : (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Net Worth</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(netWorthData?.current?.netWorth)}
              </div>
              {netWorthDelta != null && (
                <div className={`mt-1 flex items-center gap-1 text-sm ${deltaPositive ? "text-green-600" : "text-red-600"}`}>
                  <span>{deltaPositive ? "▲" : "▼"}</span>
                  <span>{formatCurrency(Math.abs(netWorthDelta))} this week</span>
                </div>
              )}
              {netWorthData?.current?.snapshotDate && (
                <p className="text-xs text-muted-foreground mt-1">
                  As of {netWorthData.current.snapshotDate}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Budget This Month */}
        {loadingBudget ? (
          <SkeletonCard />
        ) : (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Budget — {isoToMonthLabel(selectedMonth)}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(budgetData?.totalIncome)}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Expenses: {formatCurrency(budgetData?.totalExpenses)}
              </p>
              {budgetData && (
                <Badge
                  variant={budgetData.netGain >= 0 ? "default" : "destructive"}
                  className="mt-2 text-xs"
                >
                  Net {budgetData.netGain >= 0 ? "+" : ""}{formatCurrency(budgetData.netGain)}
                </Badge>
              )}
            </CardContent>
          </Card>
        )}

        {/* Mortgage */}
        {loadingMortgage ? (
          <SkeletonCard />
        ) : (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Mortgage</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {mortgageSummary ? formatCurrency(mortgageSummary.currentBalance) : "—"}
              </div>
              {equityPct != null && (
                <p className="text-sm text-muted-foreground mt-1">
                  Equity: {formatPercent(equityPct)}
                </p>
              )}
              {mortgageSummary?.payoffDate && (
                <p className="text-xs text-muted-foreground mt-1">
                  Payoff: {mortgageSummary.payoffDate}
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* ── Mini Charts ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

        {/* Net Worth Trend */}
        <Card className="col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Net Worth Trend</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingSnapshots ? (
              <SkeletonChart />
            ) : snapshotChartData.length === 0 ? (
              <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                No snapshot data yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={192}>
                <LineChart data={snapshotChartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v: string) => v.slice(5)}
                  />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
                    width={48}
                  />
                  <Tooltip
                    formatter={(v: number) => [formatCurrency(v), "Net Worth"]}
                  />
                  <Line
                    type="monotone"
                    dataKey="Net Worth"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Budget by Category */}
        <Card className="col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Budget by Category</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingBudget ? (
              <SkeletonChart />
            ) : categoryChartData.length === 0 ? (
              <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                No transactions this month
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={192}>
                <BarChart data={categoryChartData} margin={{ top: 4, right: 8, left: 0, bottom: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 9 }}
                    angle={-35}
                    textAnchor="end"
                    interval={0}
                  />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v: number) => `$${(v / 1000).toFixed(1)}k`}
                    width={48}
                  />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Bar dataKey="Actual" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Mortgage Balance Over Time */}
        <Card className="col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Mortgage Balance (24 mo)</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingMortgage ? (
              <SkeletonChart />
            ) : mortgageChartData.length === 0 ? (
              <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                No active mortgage
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={192}>
                <AreaChart data={mortgageChartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="mortgageGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 10 }}
                    interval={5}
                  />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
                    width={52}
                  />
                  <Tooltip formatter={(v: number) => [formatCurrency(v), "Balance"]} />
                  <Area
                    type="monotone"
                    dataKey="Balance"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    fill="url(#mortgageGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
