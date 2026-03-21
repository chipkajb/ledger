"use client";

import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency, formatPercent } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────

interface MonthData {
  month: string; // YYYY-MM
  income: number;
  expenses: number;
  funds: number;
  netGain: number;
  predictedIncome: number;
  categoryBreakdown: Record<string, number>;
}

interface YearlyCategoryTotal {
  categoryId: number;
  name: string;
  parentCategory: string;
  isIncomeSource: boolean;
  isFunds: boolean;
  budgetAmount: number | null;
  budgetPct: number | null;
  total: number;
}

interface YearlyData {
  months: MonthData[];
  categories: YearlyCategoryTotal[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

function buildYearOptions(): string[] {
  const now = new Date();
  const years: string[] = [];
  for (let y = now.getFullYear(); y >= now.getFullYear() - 5; y--) {
    years.push(String(y));
  }
  return years;
}

function monthAbbr(yyyyMM: string): string {
  const [, m] = yyyyMM.split("-");
  return new Date(2000, parseInt(m) - 1, 1).toLocaleString("default", { month: "short" });
}

function categoryRowBg(target: number, actual: number): string {
  if (target === 0 && actual === 0) return "";
  if (target === 0) return "";
  if (actual <= target) return "bg-green-50 dark:bg-green-950/30";
  return "bg-red-50 dark:bg-red-950/30";
}

// ── YTD Category Table ─────────────────────────────────────────────────────

function YtdCategoryTable({ categories }: { categories: YearlyCategoryTotal[] }) {
  // Group by parent
  const parentGroups = categories.reduce<
    Record<string, { categories: YearlyCategoryTotal[]; total: number }>
  >((acc, cat) => {
    const key = cat.parentCategory ?? "Other";
    if (!acc[key]) acc[key] = { categories: [], total: 0 };
    acc[key].categories.push(cat);
    acc[key].total += cat.total;
    return acc;
  }, {});

  const incomeParents = Object.entries(parentGroups).filter(([, g]) =>
    g.categories.some((c) => c.isIncomeSource)
  );
  const fundsParents = Object.entries(parentGroups).filter(([, g]) =>
    g.categories.some((c) => c.isFunds)
  );
  const expenseParents = Object.entries(parentGroups).filter(
    ([, g]) =>
      !g.categories.some((c) => c.isIncomeSource) &&
      !g.categories.some((c) => c.isFunds)
  );

  const allOrdered = [...incomeParents, ...fundsParents, ...expenseParents];

  if (allOrdered.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No transactions for this year.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[220px]">Category</TableHead>
          <TableHead className="text-right">YTD Actual</TableHead>
          <TableHead className="text-right">Annual Target</TableHead>
          <TableHead className="text-right">% of Target</TableHead>
          <TableHead className="text-right">Difference</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {allOrdered.map(([parent, group]) => (
          <>
            <TableRow key={`parent-${parent}`} className="bg-muted/50 font-semibold">
              <TableCell className="py-1.5 text-sm">{parent}</TableCell>
              <TableCell className="py-1.5 text-right text-sm">{formatCurrency(group.total)}</TableCell>
              <TableCell className="py-1.5 text-right text-sm">—</TableCell>
              <TableCell className="py-1.5 text-right text-sm">—</TableCell>
              <TableCell className="py-1.5 text-right text-sm">—</TableCell>
            </TableRow>
            {group.categories.map((cat) => {
              const target = cat.budgetAmount ?? 0;
              const pct = target > 0 ? (cat.total / target) * 100 : null;
              const diff = cat.total - target;
              return (
                <TableRow
                  key={`cat-${cat.categoryId}`}
                  className={categoryRowBg(target, cat.total)}
                >
                  <TableCell className="py-1.5 pl-8 text-sm">{cat.name}</TableCell>
                  <TableCell className="py-1.5 text-right text-sm">
                    {cat.total === 0 ? "—" : formatCurrency(cat.total)}
                  </TableCell>
                  <TableCell className="py-1.5 text-right text-sm">
                    {target === 0 ? (cat.total > 0 ? "---" : "—") : formatCurrency(target)}
                  </TableCell>
                  <TableCell className="py-1.5 text-right text-sm">
                    {target === 0 ? (cat.total > 0 ? "---" : "—") : formatPercent(pct)}
                  </TableCell>
                  <TableCell className="py-1.5 text-right text-sm">
                    {target === 0 ? (cat.total > 0 ? "---" : "—") : (
                      <span className={diff > 0 ? "text-red-600" : "text-green-600"}>
                        {formatCurrency(diff)}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </>
        ))}
      </TableBody>
    </Table>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function YearlyBudgetPage() {
  const yearOptions = buildYearOptions();
  const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));

  const [data, setData] = useState<YearlyData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/budget/yearly?year=${selectedYear}`)
      .then((r) => r.json())
      .then((d: YearlyData) => setData(d))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedYear]);

  const months = data?.months ?? [];

  // Chart data
  const barChartData = months.map((m) => ({
    month: monthAbbr(m.month),
    Income: m.income,
    Expenses: m.expenses,
  }));

  const lineChartData = months.map((m) => ({
    month: monthAbbr(m.month),
    "Net Gain": m.netGain,
  }));

  // Totals for the summary row
  const yearTotals = months.reduce(
    (acc, m) => ({
      income: acc.income + m.income,
      expenses: acc.expenses + m.expenses,
      netGain: acc.netGain + m.netGain,
    }),
    { income: 0, expenses: 0, netGain: 0 }
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Yearly Budget</h1>
          <p className="text-sm text-muted-foreground">{selectedYear} overview</p>
        </div>
        <Select value={selectedYear} onValueChange={setSelectedYear}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Year" />
          </SelectTrigger>
          <SelectContent>
            {yearOptions.map((y) => (
              <SelectItem key={y} value={y}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Month-by-month Net Gain Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Month-by-Month Summary</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <div className="space-y-2 p-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded bg-muted" />
              ))}
            </div>
          ) : months.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No data for {selectedYear}.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-2 pl-4 pr-2 text-left font-medium text-muted-foreground w-28">
                    Row
                  </th>
                  {months.map((m) => (
                    <th key={m.month} className="py-2 px-2 text-right font-medium text-muted-foreground">
                      {monthAbbr(m.month)}
                    </th>
                  ))}
                  <th className="py-2 pl-2 pr-4 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {/* Income row */}
                <tr className="border-b hover:bg-muted/30">
                  <td className="py-2 pl-4 pr-2 font-medium">Income</td>
                  {months.map((m) => (
                    <td key={m.month} className="py-2 px-2 text-right">
                      {m.income === 0 ? <span className="text-muted-foreground">—</span> : formatCurrency(m.income)}
                    </td>
                  ))}
                  <td className="py-2 pl-2 pr-4 text-right font-semibold">
                    {formatCurrency(yearTotals.income)}
                  </td>
                </tr>
                {/* Expenses row */}
                <tr className="border-b hover:bg-muted/30">
                  <td className="py-2 pl-4 pr-2 font-medium">Expenses</td>
                  {months.map((m) => (
                    <td key={m.month} className="py-2 px-2 text-right">
                      {m.expenses === 0 ? <span className="text-muted-foreground">—</span> : formatCurrency(m.expenses)}
                    </td>
                  ))}
                  <td className="py-2 pl-2 pr-4 text-right font-semibold">
                    {formatCurrency(yearTotals.expenses)}
                  </td>
                </tr>
                {/* Net Gain row */}
                <tr className="hover:bg-muted/30">
                  <td className="py-2 pl-4 pr-2 font-semibold">Net Gain</td>
                  {months.map((m) => (
                    <td
                      key={m.month}
                      className={`py-2 px-2 text-right font-medium ${
                        m.netGain > 0
                          ? "text-green-600"
                          : m.netGain < 0
                          ? "text-red-600"
                          : "text-muted-foreground"
                      }`}
                    >
                      {m.netGain === 0 ? "—" : formatCurrency(m.netGain)}
                    </td>
                  ))}
                  <td
                    className={`py-2 pl-2 pr-4 text-right font-bold ${
                      yearTotals.netGain >= 0 ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {formatCurrency(yearTotals.netGain)}
                  </td>
                </tr>
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Stacked Bar: Income vs Expenses */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Income vs Expenses by Month</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-64 animate-pulse rounded bg-muted" />
            ) : barChartData.every((d) => d.Income === 0 && d.Expenses === 0) ? (
              <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                No data for {selectedYear}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={256}>
                <BarChart data={barChartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
                    width={52}
                  />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Income" fill="hsl(142, 76%, 36%)" radius={[2, 2, 0, 0]} stackId="a" />
                  <Bar dataKey="Expenses" fill="hsl(0, 72%, 51%)" radius={[2, 2, 0, 0]} stackId="b" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Line: Monthly Net Gain */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Net Gain per Month</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-64 animate-pulse rounded bg-muted" />
            ) : lineChartData.every((d) => d["Net Gain"] === 0) ? (
              <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                No data for {selectedYear}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={256}>
                <LineChart data={lineChartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
                    width={52}
                  />
                  <Tooltip formatter={(v: number) => [formatCurrency(v), "Net Gain"]} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line
                    type="monotone"
                    dataKey="Net Gain"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* YTD Category Rollup */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Year-to-Date Category Rollup — {selectedYear}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded bg-muted" />
              ))}
            </div>
          ) : (
            <YtdCategoryTable categories={data?.categories ?? []} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
