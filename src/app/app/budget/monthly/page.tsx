"use client";

import { useEffect, useState } from "react";
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
import {
  formatCurrency,
  formatPercent,
  currentMonth,
  isoToMonthLabel,
  monthsInYear,
} from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────

interface CategorySummary {
  id: number;
  name: string;
  parentCategory: string;
  isIncomeSource: boolean;
  isFunds: boolean;
  target: number;
  actual: number;
  pctOfTarget: number | null;
  difference: number;
}

interface ParentGroup {
  parentCategory: string;
  target: number;
  actual: number;
  categories: CategorySummary[];
}

interface BudgetSummary {
  month: string;
  predictedIncome: number;
  totalIncome: number;
  totalExpenses: number;
  totalFunds: number;
  netGain: number;
  charityBankBalance: number;
  charityBankCarryover: number;
  parentGroups: ParentGroup[];
  categories: CategorySummary[];
}

interface Transaction {
  id: number;
  date: string;
  amount: number;
  description: string | null;
  categoryId: number;
  categoryName: string;
  parentCategory: string;
  isIncomeSource: boolean;
  isFunds: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function buildMonthOptions(): string[] {
  const now = new Date();
  const options: string[] = [];
  for (let y = now.getFullYear(); y >= now.getFullYear() - 3; y--) {
    const months = monthsInYear(y).reverse();
    for (const m of months) {
      options.push(m);
      if (options.length >= 24) return options;
    }
  }
  return options;
}

function categoryRowBg(target: number, actual: number): string {
  if (target === 0 && actual === 0) return "";
  if (target === 0 && actual > 0) return "";
  if (actual <= target) return "bg-green-50 dark:bg-green-950/30";
  return "bg-red-50 dark:bg-red-950/30";
}

function displayActual(target: number, actual: number): string {
  if (target === 0 && actual === 0) return "—";
  return formatCurrency(actual);
}

function displayTarget(target: number, actual: number): string {
  if (target === 0 && actual === 0) return "—";
  if (target === 0) return "---";
  return formatCurrency(target);
}

function displayPct(target: number, actual: number, pct: number | null): string {
  if (target === 0 && actual === 0) return "—";
  if (target === 0) return "---";
  return formatPercent(pct);
}

function displayDiff(target: number, actual: number): string {
  if (target === 0 && actual === 0) return "—";
  if (target === 0) return "---";
  return formatCurrency(actual - target);
}

// ── Category Table ─────────────────────────────────────────────────────────

function CategoryTable({
  groups,
}: {
  groups: ParentGroup[];
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[220px]">Category</TableHead>
          <TableHead className="text-right">Target</TableHead>
          <TableHead className="text-right">Actual</TableHead>
          <TableHead className="text-right">% of Target</TableHead>
          <TableHead className="text-right">Difference</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {groups.map((group) => (
          <>
            {/* Parent row */}
            <TableRow key={`parent-${group.parentCategory}`} className="bg-muted/50 font-semibold">
              <TableCell className="py-1.5 text-sm">{group.parentCategory}</TableCell>
              <TableCell className="py-1.5 text-right text-sm">{formatCurrency(group.target)}</TableCell>
              <TableCell className="py-1.5 text-right text-sm">{formatCurrency(group.actual)}</TableCell>
              <TableCell className="py-1.5 text-right text-sm">
                {group.target > 0 ? formatPercent((group.actual / group.target) * 100) : "—"}
              </TableCell>
              <TableCell className="py-1.5 text-right text-sm">
                {group.target > 0 ? (
                  <span className={group.actual - group.target > 0 ? "text-red-600" : "text-green-600"}>
                    {formatCurrency(group.actual - group.target)}
                  </span>
                ) : "—"}
              </TableCell>
            </TableRow>
            {/* Child rows */}
            {group.categories.map((cat) => (
              <TableRow
                key={`cat-${cat.id}`}
                className={categoryRowBg(cat.target, cat.actual)}
              >
                <TableCell className="py-1.5 pl-8 text-sm">{cat.name}</TableCell>
                <TableCell className="py-1.5 text-right text-sm">
                  {displayTarget(cat.target, cat.actual)}
                </TableCell>
                <TableCell className="py-1.5 text-right text-sm">
                  {displayActual(cat.target, cat.actual)}
                </TableCell>
                <TableCell className="py-1.5 text-right text-sm">
                  {displayPct(cat.target, cat.actual, cat.pctOfTarget)}
                </TableCell>
                <TableCell className="py-1.5 text-right text-sm">
                  {cat.target === 0 && cat.actual === 0
                    ? "—"
                    : cat.target === 0
                    ? "---"
                    : (
                      <span className={cat.actual - cat.target > 0 ? "text-red-600" : "text-green-600"}>
                        {displayDiff(cat.target, cat.actual)}
                      </span>
                    )}
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

export default function MonthlyBudgetPage() {
  const monthOptions = buildMonthOptions();
  const [selectedMonth, setSelectedMonth] = useState(currentMonth());

  const [summary, setSummary] = useState<BudgetSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadingTx, setLoadingTx] = useState(false);
  const [txCategoryFilter, setTxCategoryFilter] = useState<string>("all");

  useEffect(() => {
    setLoadingSummary(true);
    fetch(`/api/budget/summary?month=${selectedMonth}`)
      .then((r) => r.json())
      .then((d: BudgetSummary) => setSummary(d))
      .catch(console.error)
      .finally(() => setLoadingSummary(false));

    setLoadingTx(true);
    fetch(`/api/budget/transactions?month=${selectedMonth}`)
      .then((r) => r.json())
      .then((d: Transaction[]) => setTransactions(Array.isArray(d) ? d : []))
      .catch(console.error)
      .finally(() => setLoadingTx(false));
  }, [selectedMonth]);

  // Separate groups by type
  const incomeGroups = (summary?.parentGroups ?? []).filter((g) =>
    g.categories.some((c) => c.isIncomeSource)
  );
  const fundsGroups = (summary?.parentGroups ?? []).filter((g) =>
    g.categories.some((c) => c.isFunds)
  );
  const expenseGroups = (summary?.parentGroups ?? []).filter(
    (g) =>
      !g.categories.some((c) => c.isIncomeSource) &&
      !g.categories.some((c) => c.isFunds)
  );

  // Transaction filter options
  const filterCategories = [
    { id: "all", name: "All Categories" },
    ...Array.from(
      new Map(transactions.map((t) => [t.categoryId, t.categoryName])).entries()
    ).map(([id, name]) => ({ id: String(id), name })),
  ];

  const filteredTx =
    txCategoryFilter === "all"
      ? transactions
      : transactions.filter((t) => String(t.categoryId) === txCategoryFilter);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Monthly Budget</h1>
          <p className="text-sm text-muted-foreground">
            {isoToMonthLabel(selectedMonth)}
          </p>
        </div>
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Select month" />
          </SelectTrigger>
          <SelectContent>
            {monthOptions.map((m) => (
              <SelectItem key={m} value={m}>
                {isoToMonthLabel(m)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Summary Cards */}
      {loadingSummary ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : summary ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Predicted Income
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold">{formatCurrency(summary.predictedIncome)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Actual Income
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold">{formatCurrency(summary.totalIncome)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Actual Expenses
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold">{formatCurrency(summary.totalExpenses)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Net Gain
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-xl font-bold ${summary.netGain >= 0 ? "text-green-600" : "text-red-600"}`}>
                {formatCurrency(summary.netGain)}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* Charity Bank */}
      {summary && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Charity Bank Balance</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-4">
            <div className="text-2xl font-bold">{formatCurrency(summary.charityBankBalance)}</div>
            {summary.charityBankCarryover !== 0 && (
              <p className="text-sm text-muted-foreground">
                Carryover: {formatCurrency(summary.charityBankCarryover)}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Category Tables */}
      {loadingSummary ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded bg-muted" />
          ))}
        </div>
      ) : summary ? (
        <div className="space-y-6">
          {incomeGroups.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Income</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <CategoryTable groups={incomeGroups} />
              </CardContent>
            </Card>
          )}

          {fundsGroups.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Funds</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <CategoryTable groups={fundsGroups} />
              </CardContent>
            </Card>
          )}

          {expenseGroups.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Expenses</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <CategoryTable groups={expenseGroups} />
              </CardContent>
            </Card>
          )}

          {incomeGroups.length === 0 && fundsGroups.length === 0 && expenseGroups.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No budget data for {isoToMonthLabel(selectedMonth)}.
            </p>
          )}
        </div>
      ) : null}

      {/* Transaction List */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-sm font-medium">Transactions</CardTitle>
          <Select value={txCategoryFilter} onValueChange={setTxCategoryFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filter by category" />
            </SelectTrigger>
            <SelectContent>
              {filterCategories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="p-0">
          {loadingTx ? (
            <div className="space-y-2 p-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded bg-muted" />
              ))}
            </div>
          ) : filteredTx.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No transactions found.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTx.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell className="text-sm">{tx.date}</TableCell>
                    <TableCell className="text-sm">
                      <span className="text-muted-foreground text-xs">{tx.parentCategory} / </span>
                      {tx.categoryName}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {tx.description ?? "—"}
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium">
                      {formatCurrency(tx.amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
