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
import { ExportButton } from "@/components/ui/export-button";
import { ImportDialog } from "@/components/ui/import-dialog";
import { formatCurrency } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────

interface MonthData {
  month: string;
  income: number;
  expenses: number;
  netGain: number;
  categoryBreakdown: Record<string, number>;
}

interface YearlyCategoryTotal {
  categoryId: number;
  name: string;
  parentCategory: string;
  isIncomeSource: boolean;
  budgetAmount: number | null;
  budgetPct: number | null;
  total: number;
}

interface YearlyData {
  months: MonthData[];
  categories: YearlyCategoryTotal[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

const START_YEAR = 2023;

function buildYearOptions(): string[] {
  const now = new Date();
  const years: string[] = [];
  for (let y = now.getFullYear(); y >= START_YEAR; y--) {
    years.push(String(y));
  }
  return years;
}

function monthAbbr(yyyyMM: string): string {
  const [, m] = yyyyMM.split("-");
  return new Date(2000, parseInt(m) - 1, 1).toLocaleString("default", { month: "short" });
}

// ── YTD Category Table ─────────────────────────────────────────────────────

function YtdCategoryTable({
  categories,
  monthCount,
}: {
  categories: YearlyCategoryTotal[];
  monthCount: number;
}) {
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
  const expenseParents = Object.entries(parentGroups).filter(
    ([, g]) => !g.categories.some((c) => c.isIncomeSource)
  );

  const allOrdered = [...incomeParents, ...expenseParents];

  if (allOrdered.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No transactions for this year.
      </p>
    );
  }

  const avg = (total: number) =>
    monthCount > 0 ? formatCurrency(total / monthCount) : "—";

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[220px]">Category</TableHead>
          <TableHead className="text-right">YTD Actual</TableHead>
          <TableHead className="text-right">Monthly Avg</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {allOrdered.map(([parent, group]) => (
          <>
            <TableRow key={`parent-${parent}`} className="bg-muted/50 font-semibold">
              <TableCell className="py-1.5 text-sm">{parent}</TableCell>
              <TableCell className="py-1.5 text-right text-sm">{formatCurrency(group.total)}</TableCell>
              <TableCell className="py-1.5 text-right text-sm text-muted-foreground">{avg(group.total)}</TableCell>
            </TableRow>
            {[...group.categories].sort((a, b) => Math.abs(b.total) - Math.abs(a.total)).map((cat) => (
              <TableRow key={`cat-${cat.categoryId}`}>
                <TableCell className="py-1.5 pl-8 text-sm">{cat.name}</TableCell>
                <TableCell className="py-1.5 text-right text-sm">
                  {cat.total === 0 ? "—" : formatCurrency(cat.total)}
                </TableCell>
                <TableCell className="py-1.5 text-right text-sm text-muted-foreground">
                  {cat.total === 0 ? "—" : avg(cat.total)}
                </TableCell>
              </TableRow>
            ))}
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

  function loadData() {
    setLoading(true);
    fetch(`/api/budget/yearly?year=${selectedYear}`)
      .then((r) => r.json())
      .then((d: YearlyData) => setData(d))
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadData(); }, [selectedYear]);

  const months = data?.months ?? [];

  const barChartData = months.map((m) => ({
    month: monthAbbr(m.month),
    Income: m.income,
    Expenses: m.expenses,
  }));

  const lineChartData = months.map((m) => ({
    month: monthAbbr(m.month),
    "Net Gain": m.netGain,
  }));

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
        <div className="flex flex-wrap items-center gap-2">
          <ImportDialog
            apiUrl="/api/import/budget"
            title="Import Budget File"
            description={`Upload a Budget ${selectedYear}.xlsx file (or CSV). Each sheet should be named after a month. Columns: Date, Category, Description, Amount.`}
            templateUrl="/templates/budget-template.csv"
            triggerLabel="Import Budget XLSX"
            onSuccess={() => loadData()}
          />
          <ExportButton
            baseUrl="/api/export/budget"
            params={{ year: selectedYear }}
            label="Export Budget"
          />
          <ExportButton
            baseUrl="/api/export/transactions"
            params={{ year: selectedYear }}
            label="Export Transactions"
          />
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
                  <th className="py-2 pl-4 pr-2 text-left font-medium text-muted-foreground w-28">Row</th>
                  {months.map((m) => (
                    <th key={m.month} className="py-2 px-2 text-right font-medium text-muted-foreground">
                      {monthAbbr(m.month)}
                    </th>
                  ))}
                  <th className="py-2 px-2 text-right font-medium text-muted-foreground">Avg/mo</th>
                  <th className="py-2 pl-2 pr-4 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b hover:bg-muted/30">
                  <td className="py-2 pl-4 pr-2 font-medium">Income</td>
                  {months.map((m) => (
                    <td key={m.month} className="py-2 px-2 text-right">
                      {m.income === 0 ? <span className="text-muted-foreground">—</span> : formatCurrency(m.income)}
                    </td>
                  ))}
                  <td className="py-2 px-2 text-right font-medium text-muted-foreground">{(() => { const n = months.filter(m => m.income !== 0).length; return n ? formatCurrency(yearTotals.income / n) : "—"; })()}</td>
                  <td className="py-2 pl-2 pr-4 text-right font-semibold">{formatCurrency(yearTotals.income)}</td>
                </tr>
                <tr className="border-b hover:bg-muted/30">
                  <td className="py-2 pl-4 pr-2 font-medium">Expenses</td>
                  {months.map((m) => (
                    <td key={m.month} className="py-2 px-2 text-right">
                      {m.expenses === 0 ? <span className="text-muted-foreground">—</span> : formatCurrency(m.expenses)}
                    </td>
                  ))}
                  <td className="py-2 px-2 text-right font-medium text-muted-foreground">{(() => { const n = months.filter(m => m.expenses !== 0).length; return n ? formatCurrency(yearTotals.expenses / n) : "—"; })()}</td>
                  <td className="py-2 pl-2 pr-4 text-right font-semibold">{formatCurrency(yearTotals.expenses)}</td>
                </tr>
                <tr className="hover:bg-muted/30">
                  <td className="py-2 pl-4 pr-2 font-semibold">Net Gain</td>
                  {months.map((m) => (
                    <td key={m.month} className={`py-2 px-2 text-right font-medium ${
                      m.netGain > 0 ? "text-green-600" : m.netGain < 0 ? "text-red-600" : "text-muted-foreground"
                    }`}>
                      {m.netGain === 0 ? "—" : formatCurrency(m.netGain)}
                    </td>
                  ))}
                  {(() => { const n = months.filter(m => m.income !== 0 || m.expenses !== 0).length; const avg = n ? yearTotals.netGain / n : null; return (
                    <td className={`py-2 px-2 text-right font-medium ${avg == null ? "text-muted-foreground" : avg >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {avg == null ? "—" : formatCurrency(avg)}
                    </td>
                  ); })()}
                  <td className={`py-2 pl-2 pr-4 text-right font-bold ${
                    yearTotals.netGain >= 0 ? "text-green-600" : "text-red-600"
                  }`}>
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
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} width={52} />
                  <Tooltip
                    formatter={(v: number) => formatCurrency(v)}
                    contentStyle={{
                      backgroundColor: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "6px",
                      color: "hsl(var(--popover-foreground))",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Income" fill="hsl(142, 76%, 36%)" radius={[2, 2, 0, 0]} stackId="a" />
                  <Bar dataKey="Expenses" fill="hsl(0, 72%, 51%)" radius={[2, 2, 0, 0]} stackId="b" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

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
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} width={52} />
                  <Tooltip
                    formatter={(v: number) => [formatCurrency(v), "Net Gain"]}
                    contentStyle={{
                      backgroundColor: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "6px",
                      color: "hsl(var(--popover-foreground))",
                    }}
                  />
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
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">
            Year-to-Date Category Rollup — {selectedYear}
          </CardTitle>
          <ExportButton
            baseUrl="/api/export/budget"
            params={{ year: selectedYear }}
            label="Export"
            size="sm"
          />
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded bg-muted" />
              ))}
            </div>
          ) : (
            <YtdCategoryTable categories={data?.categories ?? []} monthCount={months.length} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
