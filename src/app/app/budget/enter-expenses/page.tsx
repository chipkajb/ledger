"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ExportButton } from "@/components/ui/export-button";
import { ImportDialog } from "@/components/ui/import-dialog";
import { formatCurrency, currentDate, getWeekLabel } from "@/lib/utils";
import { format, startOfISOWeek, subWeeks } from "date-fns";

// ── Types ──────────────────────────────────────────────────────────────────

interface Category {
  id: number;
  name: string;
  parentCategory: string;
  isIncomeSource: boolean;
  isFunds: boolean;
  sortOrder: number | null;
}

interface Transaction {
  id: number;
  date: string;
  amount: number;
  description: string | null;
  categoryId: number;
  weekLabel: string;
  categoryName: string;
  parentCategory: string;
  isIncomeSource: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function buildWeekOptions(count = 16): string[] {
  const today = new Date();
  const options: string[] = [];
  for (let i = 0; i < count; i++) {
    const weekStart = startOfISOWeek(subWeeks(today, i));
    options.push(getWeekLabel(format(weekStart, "yyyy-MM-dd")));
  }
  return options;
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function EnterExpensesPage() {
  const weekOptions = buildWeekOptions(16);
  const [selectedWeek, setSelectedWeek] = useState<string>(weekOptions[0]);

  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);

  // Form state
  const [date, setDate] = useState(currentDate());
  const [categoryId, setCategoryId] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/budget/categories")
      .then((r) => r.json())
      .then((data: Category[]) => {
        setCategories(data);
        const first = data.find((c) => !c.isIncomeSource && !c.isFunds);
        if (first) setCategoryId(String(first.id));
      })
      .catch(console.error)
      .finally(() => setLoadingCategories(false));
  }, []);

  function loadTransactions(week: string) {
    setLoadingTransactions(true);
    fetch(`/api/budget/transactions?week=${encodeURIComponent(week)}`)
      .then((r) => r.json())
      .then((data: Transaction[]) => setTransactions(Array.isArray(data) ? data : []))
      .catch(console.error)
      .finally(() => setLoadingTransactions(false));
  }

  useEffect(() => {
    if (!selectedWeek) return;
    loadTransactions(selectedWeek);
  }, [selectedWeek]);

  const parentGroups = categories.reduce<Record<string, Category[]>>((acc, cat) => {
    const key = cat.parentCategory ?? "Other";
    if (!acc[key]) acc[key] = [];
    acc[key].push(cat);
    return acc;
  }, {});

  const weeklyExpenses = transactions
    .filter((t) => !t.isIncomeSource)
    .reduce((s, t) => s + t.amount, 0);

  const weeklyIncome = transactions
    .filter((t) => t.isIncomeSource)
    .reduce((s, t) => s + t.amount, 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!date || !categoryId || !amount) {
      setFormError("Date, category, and amount are required.");
      return;
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setFormError("Amount must be a positive number.");
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
          weekLabel: selectedWeek,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? "Failed to save transaction");
      }

      await res.json();
      loadTransactions(selectedWeek);
      setAmount("");
      setDescription("");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this transaction?")) return;
    try {
      const res = await fetch(`/api/budget/transactions?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      setTransactions((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Enter Expenses</h1>
          <p className="text-muted-foreground text-sm">Record transactions for a week</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ImportDialog
            apiUrl="/api/import/transactions"
            title="Import Transactions"
            description="Upload a CSV or Excel file. Expected columns: Date, Category, Description, Amount. Also supports Debit/Credit columns."
            triggerLabel="Import CSV/XLSX"
            onSuccess={() => loadTransactions(selectedWeek)}
          />
          <ExportButton
            baseUrl="/api/export/transactions"
            params={{ week: selectedWeek }}
            label="Export Week"
          />
        </div>
      </div>

      {/* Week Selector */}
      <div className="flex items-center gap-4">
        <label className="text-sm font-medium">Week</label>
        <Select value={selectedWeek} onValueChange={setSelectedWeek}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Select week" />
          </SelectTrigger>
          <SelectContent>
            {weekOptions.map((w) => (
              <SelectItem key={w} value={w}>
                {w}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Transaction Form */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add Transaction</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Date */}
              <div className="space-y-1">
                <label className="text-sm font-medium">Date</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  required
                />
              </div>

              {/* Category */}
              <div className="space-y-1">
                <label className="text-sm font-medium">Category</label>
                {loadingCategories ? (
                  <div className="h-9 animate-pulse rounded bg-muted" />
                ) : (
                  <Select value={categoryId} onValueChange={setCategoryId}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(parentGroups).map(([parent, cats]) => (
                        <SelectGroup key={parent}>
                          <SelectLabel>{parent}</SelectLabel>
                          {cats.map((cat) => (
                            <SelectItem key={cat.id} value={String(cat.id)}>
                              {cat.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Amount */}
              <div className="space-y-1">
                <label className="text-sm font-medium">Amount ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  required
                />
              </div>

              {/* Description */}
              <div className="space-y-1">
                <label className="text-sm font-medium">Description</label>
                <input
                  type="text"
                  placeholder="Optional note"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              {formError && (
                <p className="text-sm text-red-600">{formError}</p>
              )}

              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? "Saving…" : "Add Transaction"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Transaction List */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">
              Transactions — {selectedWeek}
            </CardTitle>
            <div className="flex items-center gap-2 text-sm">
              {weeklyIncome > 0 && (
                <span className="text-green-600 font-medium text-xs">
                  In: {formatCurrency(weeklyIncome)}
                </span>
              )}
              <span className="font-semibold">
                Out: {formatCurrency(weeklyExpenses)}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            {loadingTransactions ? (
              <div className="space-y-2">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-10 animate-pulse rounded bg-muted" />
                ))}
              </div>
            ) : transactions.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No transactions for this week yet.
              </p>
            ) : (
              <div className="divide-y">
                {transactions.map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between py-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`font-medium ${tx.isIncomeSource ? "text-green-600" : ""}`}>
                          {formatCurrency(tx.amount)}
                        </span>
                        <span className="text-muted-foreground truncate">
                          {tx.categoryName}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{tx.date}</span>
                        {tx.description && (
                          <span className="truncate">{tx.description}</span>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(tx.id)}
                      className="ml-2 h-7 shrink-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      ✕
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
