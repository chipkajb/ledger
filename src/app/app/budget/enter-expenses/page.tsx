"use client";

import { useEffect, useState, useMemo } from "react";
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
import { formatCurrency, currentMonth, getWeekLabel, isoToMonthLabel } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────

interface Category {
  id: number;
  name: string;
  parentCategory: string;
  isIncomeSource: boolean;
  isFunds: boolean;
  sortOrder: number | null;
  deprecated: boolean;
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

// ── Page ───────────────────────────────────────────────────────────────────

export default function EnterExpensesPage() {
  const monthOptionsByYear = buildMonthOptionsByYear();
  const [selectedMonth, setSelectedMonth] = useState<string>(monthOptionsByYear[0].months[0]);

  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);

  // Form state
  const [formMonth, setFormMonth] = useState(currentMonth());
  const [formGroup, setFormGroup] = useState<string>("");
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
        const first = data.find((c) => !c.isIncomeSource);
        if (first) {
          setFormGroup(first.parentCategory);
          setCategoryId(String(first.id));
        }
      })
      .catch(console.error)
      .finally(() => setLoadingCategories(false));
  }, []);

  function loadTransactions(month: string) {
    setLoadingTransactions(true);
    fetch(`/api/budget/transactions?month=${encodeURIComponent(month)}`)
      .then((r) => r.json())
      .then((data: Transaction[]) => setTransactions(Array.isArray(data) ? data : []))
      .catch(console.error)
      .finally(() => setLoadingTransactions(false));
  }

  useEffect(() => {
    if (!selectedMonth) return;
    loadTransactions(selectedMonth);
  }, [selectedMonth]);

  const parentGroups = useMemo(() =>
    categories
      .filter((cat) => !cat.deprecated)
      .reduce<Record<string, Category[]>>((acc, cat) => {
        const key = cat.parentCategory ?? "Other";
        if (!acc[key]) acc[key] = [];
        acc[key].push(cat);
        return acc;
      }, {}), [categories]);

  const groupKeys = useMemo(() => Object.keys(parentGroups).sort(), [parentGroups]);

  const formCategoryOptions = useMemo(() =>
    formGroup ? (parentGroups[formGroup] ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)) : [],
    [formGroup, parentGroups]);

  const monthlyExpenses = transactions
    .filter((t) => !t.isIncomeSource)
    .reduce((s, t) => s + t.amount, 0);

  const monthlyIncome = transactions
    .filter((t) => t.isIncomeSource)
    .reduce((s, t) => s + t.amount, 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!formMonth || !categoryId || !amount) {
      setFormError("Month, category, and amount are required.");
      return;
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum === 0) {
      setFormError("Amount must be a non-zero number.");
      return;
    }

    setSubmitting(true);
    try {
      const date = `${formMonth}-01`;
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
        throw new Error(err?.error ?? "Failed to save transaction");
      }

      await res.json();
      // Reload if the submitted month matches the viewed month
      if (formMonth === selectedMonth) {
        loadTransactions(selectedMonth);
      }
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

  // ── Inline editing ─────────────────────────────────────────────────────────
  const [editingTxId, setEditingTxId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ categoryId: "", amount: "" });
  const [savingEdit, setSavingEdit] = useState(false);

  function handleStartEdit(tx: Transaction) {
    setEditingTxId(tx.id);
    setEditForm({ categoryId: String(tx.categoryId), amount: String(tx.amount) });
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
      const tx = transactions.find((t) => t.id === editingTxId)!;
      const res = await fetch("/api/budget/transactions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingTxId,
          date: tx.date,
          categoryId: parseInt(editForm.categoryId),
          amount: amountNum,
          description: tx.description,
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      setEditingTxId(null);
      loadTransactions(selectedMonth);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSavingEdit(false);
    }
  }

  // ── Paste Row state ────────────────────────────────────────────────────────
  const [pasteMonth, setPasteMonth] = useState(currentMonth());
  const [pasteGroup, setPasteGroup] = useState<string>("");
  const [pasteCategoryId, setPasteCategoryId] = useState<string>("");
  const [pasteNewGroup, setPasteNewGroup] = useState("");
  const [pasteNewCategory, setPasteNewCategory] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [pasteSubmitting, setPasteSubmitting] = useState(false);
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [pasteSuccess, setPasteSuccess] = useState<string | null>(null);

  const NEW_SENTINEL = "__new__";

  const pasteGroupOptions = useMemo(() => Object.keys(parentGroups).sort(), [parentGroups]);

  const pasteCategoryOptions = useMemo(() =>
    pasteGroup && pasteGroup !== NEW_SENTINEL ? (parentGroups[pasteGroup] ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)) : [],
    [pasteGroup, parentGroups]);

  const parsedAmounts = useMemo(() => {
    if (!pasteText.trim()) return [];
    return pasteText
      .split(/[\t\n]+/)
      .flatMap((chunk) => chunk.split(/\s{2,}/))
      .map((s) => s.replace(/[$,\s]/g, "").replace(/^\((.+)\)$/, "-$1"))
      .filter((s) => s !== "" && s !== "-")
      .map((s) => parseFloat(s))
      .filter((n) => !isNaN(n));
  }, [pasteText]);

  const pasteTotal = useMemo(() =>
    parsedAmounts.reduce((s, n) => s + n, 0), [parsedAmounts]);

  async function handlePasteSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPasteError(null);
    setPasteSuccess(null);

    if (parsedAmounts.length === 0) {
      setPasteError("No valid amounts found. Paste tab-separated values from Excel.");
      return;
    }

    const isNewGroup = pasteGroup === NEW_SENTINEL;
    const isNewCategory = pasteCategoryId === NEW_SENTINEL;

    if (isNewGroup && !pasteNewGroup.trim()) {
      setPasteError("Enter a name for the new group.");
      return;
    }
    if ((isNewGroup || isNewCategory) && !pasteNewCategory.trim()) {
      setPasteError("Enter a name for the new category.");
      return;
    }
    if (!isNewGroup && !isNewCategory && !pasteCategoryId) {
      setPasteError("Select a category.");
      return;
    }

    setPasteSubmitting(true);
    try {
      const body: Record<string, unknown> = { amounts: parsedAmounts, month: pasteMonth };
      if (isNewGroup || isNewCategory) {
        body.newParentCategory = isNewGroup ? pasteNewGroup.trim() : pasteGroup;
        body.newCategoryName = pasteNewCategory.trim();
      } else {
        body.categoryId = parseInt(pasteCategoryId);
      }

      const res = await fetch("/api/budget/transactions/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? "Failed to import");
      }

      const { inserted } = await res.json();
      setPasteSuccess(`${inserted} transaction${inserted !== 1 ? "s" : ""} added for ${isoToMonthLabel(pasteMonth)}.`);
      setPasteText("");
      if (pasteMonth === selectedMonth) {
        loadTransactions(selectedMonth);
      }
    } catch (err) {
      setPasteError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setPasteSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Enter Expenses</h1>
          <p className="text-muted-foreground text-sm">Record transactions by month</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ImportDialog
            apiUrl="/api/import/transactions"
            title="Import Transactions"
            description="Upload a CSV or Excel file. Expected columns: Date, Category, Description, Amount. Also supports Debit/Credit columns."
            templateUrl="/templates/transactions-template.csv"
            triggerLabel="Import CSV/XLSX"
            onSuccess={() => loadTransactions(selectedMonth)}
          />
          <ExportButton
            baseUrl="/api/export/transactions"
            params={{ month: selectedMonth }}
            label="Export Month"
          />
        </div>
      </div>

      {/* Month Selector */}
      <div className="flex items-center gap-4">
        <label className="text-sm font-medium">Viewing Month</label>
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-48">
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Transaction Form */}
        <Card className="border-t-4 border-t-blue-500">
          <CardHeader>
            <CardTitle className="text-base">Add Transaction</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Month */}
              <div className="space-y-1">
                <label className="text-sm font-medium">Month</label>
                <input
                  type="month"
                  value={formMonth}
                  onChange={(e) => setFormMonth(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  required
                />
              </div>

              {/* Group */}
              <div className="space-y-1">
                <label className="text-sm font-medium">Group</label>
                {loadingCategories ? (
                  <div className="h-9 animate-pulse rounded bg-muted" />
                ) : (
                  <Select
                    value={formGroup}
                    onValueChange={(v) => {
                      setFormGroup(v);
                      const first = parentGroups[v]?.[0];
                      setCategoryId(first ? String(first.id) : "");
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select group" />
                    </SelectTrigger>
                    <SelectContent>
                      {groupKeys.map((g) => (
                        <SelectItem key={g} value={g}>{g}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Category */}
              <div className="space-y-1">
                <label className="text-sm font-medium">Category</label>
                {loadingCategories ? (
                  <div className="h-9 animate-pulse rounded bg-muted" />
                ) : (
                  <Select value={categoryId} onValueChange={setCategoryId} disabled={!formGroup}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={formGroup ? "Select category" : "Select a group first"} />
                    </SelectTrigger>
                    <SelectContent>
                      {formCategoryOptions.map((cat) => (
                        <SelectItem key={cat.id} value={String(cat.id)}>
                          {cat.name}
                        </SelectItem>
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
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  required
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
        <Card className="border-t-4 border-t-emerald-500">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">
              {isoToMonthLabel(selectedMonth)}
            </CardTitle>
            <div className="flex items-center gap-2 text-sm">
              {monthlyIncome > 0 && (
                <span className="text-green-600 font-medium text-xs">
                  In: {formatCurrency(monthlyIncome)}
                </span>
              )}
              <span className="font-semibold text-red-500">
                Out: {formatCurrency(monthlyExpenses)}
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
                No transactions for this month yet.
              </p>
            ) : (
              <div className="divide-y max-h-96 overflow-y-auto">
                {transactions.map((tx) => {
                  const isEditing = editingTxId === tx.id;
                  if (isEditing) {
                    return (
                      <div key={tx.id} className="flex items-center gap-2 py-2 bg-muted/30">
                        <Select
                          value={editForm.categoryId}
                          onValueChange={(v) => setEditForm((f) => ({ ...f, categoryId: v }))}
                        >
                          <SelectTrigger className="h-7 flex-1 text-xs">
                            <SelectValue placeholder="Category" />
                          </SelectTrigger>
                          <SelectContent>
                            {categories
                              .filter((cat) => !cat.deprecated || String(cat.id) === editForm.categoryId)
                              .slice()
                              .sort((a, b) => a.parentCategory.localeCompare(b.parentCategory) || a.name.localeCompare(b.name))
                              .map((cat) => (
                                <SelectItem key={cat.id} value={String(cat.id)}>
                                  {cat.parentCategory} / {cat.name}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        <input
                          type="number"
                          step="0.01"
                          value={editForm.amount}
                          onChange={(e) => setEditForm((f) => ({ ...f, amount: e.target.value }))}
                          className="h-7 w-24 rounded-md border border-input bg-background px-2 py-1 text-xs text-right shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        />
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
                    );
                  }
                  return (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between py-2 text-sm cursor-pointer hover:bg-muted/30"
                      onClick={() => handleStartEdit(tx)}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`font-medium ${tx.isIncomeSource ? "text-green-600" : ""}`}>
                            {formatCurrency(tx.amount)}
                          </span>
                          <span className="text-muted-foreground truncate">
                            {tx.categoryName}
                          </span>
                        </div>
                        {tx.description && (
                          <div className="text-xs text-muted-foreground truncate">
                            {tx.description}
                          </div>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); handleDelete(tx.id); }}
                        className="ml-2 h-7 shrink-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        ✕
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Paste Row Import */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Paste Row from Excel</CardTitle>
          <p className="text-sm text-muted-foreground">
            Copy a row of amounts from your Excel budget, pick the group and category, then paste and submit.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePasteSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {/* Month */}
              <div className="space-y-1">
                <label className="text-sm font-medium">Month</label>
                <input
                  type="month"
                  value={pasteMonth}
                  onChange={(e) => setPasteMonth(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  required
                />
              </div>

              {/* Group */}
              <div className="space-y-1">
                <label className="text-sm font-medium">Group</label>
                <Select
                  value={pasteGroup}
                  onValueChange={(v) => {
                    setPasteGroup(v);
                    setPasteCategoryId("");
                    setPasteNewGroup("");
                    setPasteNewCategory("");
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select group" />
                  </SelectTrigger>
                  <SelectContent>
                    {pasteGroupOptions.map((g) => (
                      <SelectItem key={g} value={g}>{g}</SelectItem>
                    ))}
                    <SelectItem value={NEW_SENTINEL}>+ New group…</SelectItem>
                  </SelectContent>
                </Select>
                {pasteGroup === NEW_SENTINEL && (
                  <input
                    type="text"
                    placeholder="New group name"
                    value={pasteNewGroup}
                    onChange={(e) => setPasteNewGroup(e.target.value)}
                    className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    autoFocus
                  />
                )}
              </div>

              {/* Category */}
              <div className="space-y-1">
                <label className="text-sm font-medium">Category</label>
                {pasteGroup && pasteGroup !== NEW_SENTINEL ? (
                  <>
                    <Select
                      value={pasteCategoryId}
                      onValueChange={(v) => {
                        setPasteCategoryId(v);
                        setPasteNewCategory("");
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {pasteCategoryOptions.map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                        ))}
                        <SelectItem value={NEW_SENTINEL}>+ New category…</SelectItem>
                      </SelectContent>
                    </Select>
                    {pasteCategoryId === NEW_SENTINEL && (
                      <input
                        type="text"
                        placeholder="New category name"
                        value={pasteNewCategory}
                        onChange={(e) => setPasteNewCategory(e.target.value)}
                        className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        autoFocus
                      />
                    )}
                  </>
                ) : pasteGroup === NEW_SENTINEL ? (
                  <input
                    type="text"
                    placeholder="New category name"
                    value={pasteNewCategory}
                    onChange={(e) => setPasteNewCategory(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                ) : (
                  <div className="flex h-9 items-center rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground">
                    Select a group first
                  </div>
                )}
              </div>
            </div>

            {/* Paste Area */}
            <div className="space-y-1">
              <label className="text-sm font-medium">
                Amounts{" "}
                <span className="font-normal text-muted-foreground">
                  — paste a row from Excel (tab-separated)
                </span>
              </label>
              <textarea
                rows={3}
                placeholder={"$30.05\t$12.50\t-$60.00\t$142.83\t$46.99…"}
                value={pasteText}
                onChange={(e) => {
                  setPasteText(e.target.value);
                  setPasteError(null);
                  setPasteSuccess(null);
                }}
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            {/* Live Preview */}
            {parsedAmounts.length > 0 && (
              <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
                <span className="font-medium">{parsedAmounts.length} amounts</span>
                {" · total "}
                <span className={`font-semibold ${pasteTotal < 0 ? "text-green-600" : ""}`}>
                  {formatCurrency(pasteTotal)}
                </span>
                <div className="mt-1 flex flex-wrap gap-1">
                  {parsedAmounts.map((n, i) => (
                    <span
                      key={i}
                      className={`rounded px-1.5 py-0.5 text-xs ${
                        n < 0
                          ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                          : "bg-background border border-border"
                      }`}
                    >
                      {formatCurrency(n)}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {pasteError && <p className="text-sm text-red-600">{pasteError}</p>}
            {pasteSuccess && <p className="text-sm text-green-600">{pasteSuccess}</p>}

            <Button
              type="submit"
              disabled={pasteSubmitting || parsedAmounts.length === 0}
              className="w-full sm:w-auto"
            >
              {pasteSubmitting
                ? "Importing…"
                : parsedAmounts.length > 0
                ? `Import ${parsedAmounts.length} transaction${parsedAmounts.length !== 1 ? "s" : ""}`
                : "Import"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
