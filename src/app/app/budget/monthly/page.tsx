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
  SelectGroup,
  SelectItem,
  SelectLabel,
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
import { Button } from "@/components/ui/button";
import { ExportButton } from "@/components/ui/export-button";
import { ImportDialog } from "@/components/ui/import-dialog";
import {
  formatCurrency,
  currentMonth,
  isoToMonthLabel,
  getWeekLabel,
  currentDate,
} from "@/lib/utils";
import { format, subMonths, parseISO } from "date-fns";

// ── Types ──────────────────────────────────────────────────────────────────

interface CategorySummary {
  id: number;
  name: string;
  parentCategory: string;
  isIncomeSource: boolean;
  actual: number;
}

interface ParentGroup {
  parentCategory: string;
  actual: number;
  categories: CategorySummary[];
}

function prevMonthStr(month: string): string {
  return format(subMonths(parseISO(`${month}-01`), 1), "yyyy-MM");
}

function DiffBadge({ curr, prev }: { curr: number; prev: number | undefined }) {
  if (prev === undefined) return null;
  const diff = curr - prev;
  if (diff === 0) return null;
  const up = diff > 0;
  return (
    <span className={`text-xs ml-1 font-normal ${up ? "text-red-500" : "text-green-600"}`}>
      {up ? "▲" : "▼"} {formatCurrency(Math.abs(diff))}
    </span>
  );
}

function IncomeDiffBadge({ curr, prev }: { curr: number; prev: number | undefined }) {
  if (prev === undefined) return null;
  const diff = curr - prev;
  if (diff === 0) return null;
  const up = diff > 0;
  return (
    <span className={`text-xs ml-1 font-normal ${up ? "text-green-600" : "text-red-500"}`}>
      {up ? "▲" : "▼"} {formatCurrency(Math.abs(diff))}
    </span>
  );
}


interface BudgetSummary {
  month: string;
  totalIncome: number;
  totalExpenses: number;
  netGain: number;
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

interface Category {
  id: number;
  name: string;
  parentCategory: string;
  isIncomeSource: boolean;
  isFunds: boolean;
  sortOrder: number | null;
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

// ── Category Table ─────────────────────────────────────────────────────────

function filterGroups(groups: ParentGroup[], hideEmpty: boolean): ParentGroup[] {
  if (!hideEmpty) return groups;
  return groups
    .map((g) => ({ ...g, categories: g.categories.filter((c) => c.actual !== 0) }))
    .filter((g) => g.categories.length > 0);
}

function CategoryTable({
  groups,
  hideEmpty,
  prevGroups,
  isIncome,
}: {
  groups: ParentGroup[];
  hideEmpty: boolean;
  prevGroups?: ParentGroup[];
  isIncome?: boolean;
}) {
  const Badge = isIncome ? IncomeDiffBadge : DiffBadge;
  const filtered = filterGroups(groups, hideEmpty);
  const prevMap = new Map(prevGroups?.map((g) => [g.parentCategory, g]) ?? []);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[220px]">Category</TableHead>
          <TableHead className="text-right">Actual</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {filtered.map((group) => {
          const prevGroup = prevMap.get(group.parentCategory);
          const prevCatMap = new Map(prevGroup?.categories.map((c) => [c.id, c]) ?? []);
          return (
            <>
              <TableRow key={`parent-${group.parentCategory}`} className="bg-muted/50 font-semibold">
                <TableCell className="py-1.5 text-sm">{group.parentCategory}</TableCell>
                <TableCell className="py-1.5 text-right text-sm">
                  {formatCurrency(group.actual)}
                  <Badge curr={group.actual} prev={prevGroup?.actual} />
                </TableCell>
              </TableRow>
              {group.categories.map((cat) => {
                const prevCat = prevCatMap.get(cat.id);
                return (
                  <TableRow key={`cat-${cat.id}`}>
                    <TableCell className="py-1.5 pl-8 text-sm">{cat.name}</TableCell>
                    <TableCell className="py-1.5 text-right text-sm">
                      {cat.actual === 0 ? "—" : formatCurrency(cat.actual)}
                      {cat.actual !== 0 && <Badge curr={cat.actual} prev={prevCat?.actual} />}
                    </TableCell>
                  </TableRow>
                );
              })}
            </>
          );
        })}
      </TableBody>
    </Table>
  );
}

// ── Quick-Add Transaction Form ─────────────────────────────────────────────

function QuickAddTransaction({
  month: _month,
  categories,
  onAdded,
}: {
  month: string;
  categories: Category[];
  onAdded: () => void;
}) {
  const [date, setDate] = useState(currentDate());
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Default category when categories load
  useEffect(() => {
    const first = categories.find((c) => !c.isIncomeSource && !c.isFunds);
    if (first && !categoryId) setCategoryId(String(first.id));
  }, [categories]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const amountNum = parseFloat(amount);
    if (!date || !categoryId || isNaN(amountNum) || amountNum === 0) {
      setError("Date, category, and a non-zero amount are required.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/budget/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          categoryId: parseInt(categoryId),
          amount: amountNum,
          description: description.trim() || null,
          weekLabel: getWeekLabel(date),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? "Failed to save");
      }
      setAmount("");
      setDescription("");
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Date</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="flex h-8 w-36 rounded-md border border-input bg-transparent px-2 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          required
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Category</label>
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger className="h-8 w-48 text-sm">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            {categories
              .slice()
              .sort((a, b) => a.parentCategory.localeCompare(b.parentCategory) || a.name.localeCompare(b.name))
              .map((cat) => (
                <SelectItem key={cat.id} value={String(cat.id)}>
                  {cat.parentCategory} / {cat.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Amount ($)</label>
        <input
          type="number"
          step="0.01"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="flex h-8 w-28 rounded-md border border-input bg-transparent px-2 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          required
        />
      </div>
      <div className="space-y-1">
        {error && <p className="text-xs text-red-500">{error}</p>}
        <Button type="submit" size="sm" disabled={submitting} className="h-8">
          {submitting ? "Saving…" : "Add"}
        </Button>
      </div>
    </form>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function MonthlyBudgetPage() {
  const monthOptionsByYear = buildMonthOptionsByYear();
  const [selectedMonth, setSelectedMonth] = useState(currentMonth());

  const [summary, setSummary] = useState<BudgetSummary | null>(null);
  const [prevSummary, setPrevSummary] = useState<BudgetSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadingTx, setLoadingTx] = useState(false);
  const [txCategoryFilter, setTxCategoryFilter] = useState<string>("all");

  const [categories, setCategories] = useState<Category[]>([]);
  const [hideEmpty, setHideEmpty] = useState(false);

  const [editingTxId, setEditingTxId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ month: "", categoryId: "", amount: "" });
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    fetch("/api/budget/categories")
      .then((r) => r.json())
      .then((d: Category[]) => setCategories(d))
      .catch(console.error);
  }, []);

  function loadData() {
    setLoadingSummary(true);
    const prevMonth = prevMonthStr(selectedMonth);
    Promise.all([
      fetch(`/api/budget/summary?month=${selectedMonth}`).then((r) => r.json()),
      fetch(`/api/budget/summary?month=${prevMonth}`).then((r) => r.json()),
    ])
      .then(([curr, prev]: [BudgetSummary, BudgetSummary]) => {
        setSummary(curr);
        setPrevSummary(prev);
      })
      .catch(console.error)
      .finally(() => setLoadingSummary(false));

    setLoadingTx(true);
    fetch(`/api/budget/transactions?month=${selectedMonth}`)
      .then((r) => r.json())
      .then((d: Transaction[]) => setTransactions(Array.isArray(d) ? d : []))
      .catch(console.error)
      .finally(() => setLoadingTx(false));
  }

  useEffect(() => { loadData(); }, [selectedMonth]);

  function handleStartEdit(tx: Transaction) {
    setEditingTxId(tx.id);
    setEditForm({
      month: tx.date.slice(0, 7),
      categoryId: String(tx.categoryId),
      amount: String(tx.amount),
    });
  }

  function handleCancelEdit() {
    setEditingTxId(null);
  }

  async function handleSaveEdit() {
    if (!editingTxId) return;
    const amountNum = parseFloat(editForm.amount);
    if (isNaN(amountNum) || amountNum === 0) {
      alert("Amount must be a non-zero number.");
      return;
    }
    setSavingEdit(true);
    try {
      const res = await fetch("/api/budget/transactions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingTxId,
          month: editForm.month,
          categoryId: parseInt(editForm.categoryId),
          amount: amountNum,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? "Save failed");
      }
      setEditingTxId(null);
      loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDeleteTx(id: number) {
    if (!confirm("Delete this transaction?")) return;
    try {
      const res = await fetch(`/api/budget/transactions?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      setTransactions((prev) => prev.filter((t) => t.id !== id));
      loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  const incomeGroups = (summary?.parentGroups ?? []).filter((g) =>
    g.categories.some((c) => c.isIncomeSource)
  );
  const expenseGroups = (summary?.parentGroups ?? []).filter(
    (g) => !g.categories.some((c) => c.isIncomeSource)
  );
  const prevIncomeGroups = (prevSummary?.parentGroups ?? []).filter((g) =>
    g.categories.some((c) => c.isIncomeSource)
  );
  const prevExpenseGroups = (prevSummary?.parentGroups ?? []).filter(
    (g) => !g.categories.some((c) => c.isIncomeSource)
  );

  const filterCategories = [
    { id: "all", name: "All Categories" },
    ...Array.from(
      new Map(transactions.map((t) => [t.categoryId, t.categoryName])).entries()
    )
      .map(([id, name]) => ({ id: String(id), name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
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
        <div className="flex flex-wrap items-center gap-2">
          <ImportDialog
            apiUrl="/api/import/transactions"
            title="Import Transactions"
            description="Upload a CSV or Excel file. Expected columns: Date, Category, Description, Amount."
            templateUrl="/templates/transactions-template.csv"
            triggerLabel="Import CSV/XLSX"
            onSuccess={() => loadData()}
          />
          <ExportButton
            baseUrl="/api/export/transactions"
            params={{ month: selectedMonth }}
            label="Export"
          />
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
      </div>

      {/* Summary Cards */}
      {loadingSummary ? (
        <div className="grid grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : summary ? (
        <div className="grid grid-cols-3 gap-4">
          <Card className="border-l-4 border-l-emerald-500">
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Actual Income
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(summary.totalIncome)}</div>
              <IncomeDiffBadge curr={summary.totalIncome} prev={prevSummary?.totalIncome} />
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-red-500">
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Actual Expenses
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold text-red-500 dark:text-red-400">{formatCurrency(summary.totalExpenses)}</div>
              <DiffBadge curr={summary.totalExpenses} prev={prevSummary?.totalExpenses} />
            </CardContent>
          </Card>
          <Card className={`border-l-4 ${summary.netGain >= 0 ? "border-l-blue-500" : "border-l-red-500"}`}>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Net Gain
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-xl font-bold ${summary.netGain >= 0 ? "text-blue-600 dark:text-blue-400" : "text-red-600"}`}>
                {formatCurrency(summary.netGain)}
              </div>
              <IncomeDiffBadge curr={summary.netGain} prev={prevSummary?.netGain} />
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* Category Tables */}
      {loadingSummary ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded bg-muted" />
          ))}
        </div>
      ) : summary ? (
        <div className="space-y-4">
          <div className="flex items-center justify-end">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground select-none">
              <input
                type="checkbox"
                checked={hideEmpty}
                onChange={(e) => setHideEmpty(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-border accent-primary"
              />
              Hide rows with no data
            </label>
          </div>

          <div className="space-y-6">
            {filterGroups(incomeGroups, hideEmpty).length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Income</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <CategoryTable groups={incomeGroups} hideEmpty={hideEmpty} prevGroups={prevIncomeGroups} isIncome />
                </CardContent>
              </Card>
            )}

            {filterGroups(expenseGroups, hideEmpty).length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Expenses</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <CategoryTable groups={expenseGroups} hideEmpty={hideEmpty} prevGroups={prevExpenseGroups} />
                </CardContent>
              </Card>
            )}

            {incomeGroups.length === 0 && expenseGroups.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No budget data for {isoToMonthLabel(selectedMonth)}.
              </p>
            )}
          </div>
        </div>
      ) : null}

      {/* Quick Add Transaction */}
      {categories.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Quick Add Transaction</CardTitle>
          </CardHeader>
          <CardContent>
            <QuickAddTransaction
              month={selectedMonth}
              categories={categories}
              onAdded={loadData}
            />
          </CardContent>
        </Card>
      )}

      {/* Transaction List */}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-3">
          <CardTitle className="text-sm font-medium">
            Transactions ({filteredTx.length})
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
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
            <ExportButton
              baseUrl="/api/export/transactions"
              params={{ month: selectedMonth }}
              label="Export"
              size="sm"
            />
          </div>
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
                  <TableHead>Month</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTx.map((tx) => {
                  const isEditing = editingTxId === tx.id;

                  if (isEditing) {
                    return (
                      <TableRow key={tx.id} className="bg-muted/30">
                        <TableCell className="py-1">
                          <input
                            type="month"
                            value={editForm.month}
                            onChange={(e) => setEditForm((f) => ({ ...f, month: e.target.value }))}
                            className="flex h-7 w-32 rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                        </TableCell>
                        <TableCell className="py-1">
                          <Select value={editForm.categoryId} onValueChange={(v) => setEditForm((f) => ({ ...f, categoryId: v }))}>
                            <SelectTrigger className="h-7 w-52 text-xs">
                              <SelectValue placeholder="Category" />
                            </SelectTrigger>
                            <SelectContent>
                              {categories
                                .slice()
                                .sort((a, b) => a.parentCategory.localeCompare(b.parentCategory) || a.name.localeCompare(b.name))
                                .map((cat) => (
                                  <SelectItem key={cat.id} value={String(cat.id)}>
                                    {cat.parentCategory} / {cat.name}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="py-1 text-right">
                          <input
                            type="number"
                            step="0.01"
                            value={editForm.amount}
                            onChange={(e) => setEditForm((f) => ({ ...f, amount: e.target.value }))}
                            className="flex h-7 w-24 rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm text-right focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                        </TableCell>
                        <TableCell className="py-1">
                          <div className="flex gap-1">
                            <button
                              onClick={handleSaveEdit}
                              disabled={savingEdit}
                              className="text-xs text-green-600 hover:text-green-800 px-1 font-medium"
                              title="Save"
                            >
                              ✓
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              className="text-xs text-muted-foreground hover:text-foreground px-1"
                              title="Cancel"
                            >
                              ✕
                            </button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  }

                  return (
                    <TableRow
                      key={tx.id}
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() => handleStartEdit(tx)}
                    >
                      <TableCell className="text-sm whitespace-nowrap">{isoToMonthLabel(tx.date.slice(0, 7))}</TableCell>
                      <TableCell className="text-sm">
                        <span className="text-muted-foreground text-xs">{tx.parentCategory} / </span>
                        {tx.categoryName}
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium">
                        {formatCurrency(tx.amount)}
                      </TableCell>
                      <TableCell>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteTx(tx.id); }}
                          className="text-xs text-red-500 hover:text-red-700 px-1"
                          title="Delete transaction"
                        >
                          ✕
                        </button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
