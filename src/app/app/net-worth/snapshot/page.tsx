"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ImportDialog } from "@/components/ui/import-dialog";
import { formatCurrency, currentDate } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────

interface SimpleFormData {
  date: string;
  checkingAccount: string;
  savingsAccount: string;
  hsaHra: string;
  plan529: string;
  mortgageBalance: string;
  studentLoans: string;
  personalLoans: string;
}

interface AccountRow {
  id: number;
  label: string;
  amount: string;
}

interface PoolRow {
  id: number;
  label: string;
  options: string;
}

interface CalcState {
  homeValue: string;
  accounts401k: AccountRow[];
  investAccounts: AccountRow[];
  teamworksFMV: string;
  teamworksPools: PoolRow[];
}

const LS_KEY = "nw-calc-state";

const defaultCalcState: CalcState = {
  homeValue: "",
  accounts401k: [{ id: 1, label: "401k", amount: "" }],
  investAccounts: [{ id: 1, label: "Brokerage", amount: "" }],
  teamworksFMV: "",
  teamworksPools: [
    { id: 1, label: "Pool 1", options: "" },
    { id: 2, label: "Pool 2", options: "" },
    { id: 3, label: "Pool 3", options: "" },
  ],
};

const defaultForm: SimpleFormData = {
  date: currentDate(),
  checkingAccount: "",
  savingsAccount: "",
  hsaHra: "",
  plan529: "",
  mortgageBalance: "",
  studentLoans: "",
  personalLoans: "",
};

function parseNum(val: string): number {
  const n = parseFloat(val.replace(/[^0-9.-]/g, ""));
  return isNaN(n) ? 0 : n;
}

// ── Sub-components ─────────────────────────────────────────────────────────

function DollarInput({
  value,
  onChange,
  placeholder = "0.00",
  className = "",
  min,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  min?: string;
}) {
  return (
    <div className={`relative flex-1 ${className}`}>
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
      <Input
        type="number"
        step="0.01"
        min={min}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pl-7"
      />
    </div>
  );
}

function MultiAccountRows({
  rows,
  onUpdate,
  onAdd,
  onRemove,
  addLabel,
  total,
}: {
  rows: AccountRow[];
  onUpdate: (id: number, field: "label" | "amount", value: string) => void;
  onAdd: () => void;
  onRemove: (id: number) => void;
  addLabel: string;
  total: number;
}) {
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.id} className="flex items-center gap-2">
          <Input
            type="text"
            placeholder="Account name"
            value={row.label}
            onChange={(e) => onUpdate(row.id, "label", e.target.value)}
            className="w-36 shrink-0 text-sm"
          />
          <DollarInput
            value={row.amount}
            onChange={(v) => onUpdate(row.id, "amount", v)}
            min="0"
          />
          {rows.length > 1 && (
            <button
              type="button"
              onClick={() => onRemove(row.id)}
              className="text-xs text-muted-foreground hover:text-red-500 px-1 shrink-0"
              title="Remove"
            >
              ✕
            </button>
          )}
        </div>
      ))}
      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          onClick={onAdd}
          className="text-xs text-primary hover:underline"
        >
          + {addLabel}
        </button>
        {rows.length > 1 && (
          <span className="text-xs text-muted-foreground">
            Total: <span className="font-medium text-foreground">{formatCurrency(total)}</span>
          </span>
        )}
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function NetWorthSnapshotPage() {
  const [form, setForm] = useState<SimpleFormData>(defaultForm);
  const [calc, setCalc] = useState<CalcState>(defaultCalcState);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function loadLatest() {
      let savedCalc: CalcState | null = null;
      try {
        const raw = localStorage.getItem(LS_KEY);
        if (raw) savedCalc = JSON.parse(raw);
      } catch {
        // ignore
      }

      try {
        const res = await fetch("/api/net-worth/latest");
        if (res.ok) {
          const data = await res.json();
          const snap = data?.current ?? data;
          if (snap) {
            setForm({
              date: currentDate(),
              checkingAccount: snap.checking?.toString() ?? "",
              savingsAccount: snap.savings?.toString() ?? "",
              hsaHra: snap.hsaHra?.toString() ?? "",
              plan529: snap.plan529?.toString() ?? "",
              mortgageBalance: snap.mortgageBalance?.toString() ?? "",
              studentLoans: snap.studentLoans?.toString() ?? "",
              personalLoans: snap.personalLoans?.toString() ?? "",
            });

            if (savedCalc) {
              setCalc(savedCalc);
            } else {
              // First-time: reverse-calculate home value and seed single accounts
              const storedEquity = snap.homeEquity ?? 0;
              const storedMortgage = snap.mortgageBalance ?? 0;
              setCalc({
                homeValue: (storedEquity + storedMortgage) > 0
                  ? String(storedEquity + storedMortgage)
                  : "",
                accounts401k: [{ id: 1, label: "401k", amount: snap.retirement401k?.toString() ?? "" }],
                investAccounts: [{ id: 1, label: "Brokerage", amount: snap.investments?.toString() ?? "" }],
                teamworksFMV: "",
                teamworksPools: defaultCalcState.teamworksPools,
              });
            }
          }
        }
      } catch {
        // no latest snapshot yet
      } finally {
        setLoading(false);
      }
    }
    loadLatest();
  }, []);

  // ── Computed values ──────────────────────────────────────────────────────

  const homeEquity = parseNum(calc.homeValue) - parseNum(form.mortgageBalance);
  const total401k = calc.accounts401k.reduce((s, a) => s + parseNum(a.amount), 0);
  const totalInvest = calc.investAccounts.reduce((s, a) => s + parseNum(a.amount), 0);
  const fmv = parseNum(calc.teamworksFMV);
  const totalTeamworks = calc.teamworksPools.reduce((s, p) => s + parseNum(p.options) * fmv, 0);

  const totalAssets =
    parseNum(form.checkingAccount) +
    parseNum(form.savingsAccount) +
    homeEquity +
    total401k +
    parseNum(form.hsaHra) +
    totalInvest +
    parseNum(form.plan529) +
    totalTeamworks;

  const totalLiabilities =
    parseNum(form.mortgageBalance) +
    parseNum(form.studentLoans) +
    parseNum(form.personalLoans);

  const netWorth = totalAssets - totalLiabilities;

  // ── Form helpers ─────────────────────────────────────────────────────────

  function handleChange(field: keyof SimpleFormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function updateAccount401k(id: number, field: "label" | "amount", value: string) {
    setCalc((prev) => ({
      ...prev,
      accounts401k: prev.accounts401k.map((a) => a.id === id ? { ...a, [field]: value } : a),
    }));
  }

  function addAccount401k() {
    setCalc((prev) => ({
      ...prev,
      accounts401k: [...prev.accounts401k, { id: Date.now(), label: "", amount: "" }],
    }));
  }

  function removeAccount401k(id: number) {
    setCalc((prev) => ({
      ...prev,
      accounts401k: prev.accounts401k.filter((a) => a.id !== id),
    }));
  }

  function updateInvestAccount(id: number, field: "label" | "amount", value: string) {
    setCalc((prev) => ({
      ...prev,
      investAccounts: prev.investAccounts.map((a) => a.id === id ? { ...a, [field]: value } : a),
    }));
  }

  function addInvestAccount() {
    setCalc((prev) => ({
      ...prev,
      investAccounts: [...prev.investAccounts, { id: Date.now(), label: "", amount: "" }],
    }));
  }

  function removeInvestAccount(id: number) {
    setCalc((prev) => ({
      ...prev,
      investAccounts: prev.investAccounts.filter((a) => a.id !== id),
    }));
  }

  function updatePool(id: number, field: "label" | "options", value: string) {
    setCalc((prev) => ({
      ...prev,
      teamworksPools: prev.teamworksPools.map((p) => p.id === id ? { ...p, [field]: value } : p),
    }));
  }

  function addPool() {
    setCalc((prev) => ({
      ...prev,
      teamworksPools: [
        ...prev.teamworksPools,
        { id: Date.now(), label: `Pool ${prev.teamworksPools.length + 1}`, options: "" },
      ],
    }));
  }

  function removePool(id: number) {
    setCalc((prev) => ({
      ...prev,
      teamworksPools: prev.teamworksPools.filter((p) => p.id !== id),
    }));
  }

  // ── Submit ───────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    try {
      localStorage.setItem(LS_KEY, JSON.stringify(calc));
    } catch {
      // ignore
    }

    try {
      const body = {
        snapshotDate: form.date,
        checking: parseNum(form.checkingAccount),
        savings: parseNum(form.savingsAccount),
        homeEquity,
        retirement401k: total401k,
        hsaHra: parseNum(form.hsaHra),
        investments: totalInvest,
        plan529: parseNum(form.plan529),
        teamworksEquity: totalTeamworks,
        mortgageBalance: parseNum(form.mortgageBalance),
        studentLoans: parseNum(form.studentLoans),
        personalLoans: parseNum(form.personalLoans),
      };
      const res = await fetch("/api/net-worth/snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? "Failed to save snapshot");
      }
      toast.success("Snapshot saved successfully");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save snapshot");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Loading state ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">New Net Worth Snapshot</h1>
          <p className="text-muted-foreground">
            Enter your current balances. Fields are pre-filled from your latest snapshot.
          </p>
        </div>
        <ImportDialog
          apiUrl="/api/import/net-worth"
          title="Import Net Worth History"
          description="Upload a CSV or Excel file with your historical net worth snapshots. Columns: Date, Checking, Savings, Home Equity, 401K, HSA/HRA, Investments, 529 Plan, Teamworks, Mortgage Balance, Student Loans, Personal Loans."
          templateUrl="/templates/net-worth-template.csv"
          triggerLabel="Import Historical Data"
          triggerVariant="outline"
        />
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Date */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Snapshot Date</CardTitle>
          </CardHeader>
          <CardContent>
            <Input
              type="date"
              value={form.date}
              onChange={(e) => handleChange("date", e.target.value)}
              className="w-48"
              required
            />
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Assets */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-green-600 dark:text-green-400">Assets</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">

              {/* Checking */}
              <div className="flex items-center gap-3">
                <label className="w-44 shrink-0 text-sm text-muted-foreground">Checking Account</label>
                <DollarInput value={form.checkingAccount} onChange={(v) => handleChange("checkingAccount", v)} min="0" />
              </div>

              {/* Savings */}
              <div className="flex items-center gap-3">
                <label className="w-44 shrink-0 text-sm text-muted-foreground">Savings Account</label>
                <DollarInput value={form.savingsAccount} onChange={(v) => handleChange("savingsAccount", v)} min="0" />
              </div>

              {/* Home Equity — calculated */}
              <div className="space-y-2 rounded-md border border-dashed border-border p-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Home Equity (calculated)</p>
                <div className="flex items-center gap-3">
                  <label className="w-36 shrink-0 text-sm text-muted-foreground">Home Value</label>
                  <DollarInput
                    value={calc.homeValue}
                    onChange={(v) => setCalc((prev) => ({ ...prev, homeValue: v }))}
                    min="0"
                  />
                </div>
                <div className="flex items-center justify-between pt-1 text-sm">
                  <span className="text-muted-foreground text-xs">Home Value − Mortgage Balance</span>
                  <span className={`font-semibold ${homeEquity >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                    {formatCurrency(homeEquity)}
                  </span>
                </div>
              </div>

              {/* 401k — multi-account */}
              <div className="space-y-2 rounded-md border border-dashed border-border p-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">401k / Retirement</p>
                <MultiAccountRows
                  rows={calc.accounts401k}
                  onUpdate={updateAccount401k}
                  onAdd={addAccount401k}
                  onRemove={removeAccount401k}
                  addLabel="Add account"
                  total={total401k}
                />
                {calc.accounts401k.length > 1 && (
                  <div className="border-t pt-2 flex justify-between text-sm font-semibold">
                    <span>Total 401k</span>
                    <span className="text-green-600 dark:text-green-400">{formatCurrency(total401k)}</span>
                  </div>
                )}
              </div>

              {/* HSA */}
              <div className="flex items-center gap-3">
                <label className="w-44 shrink-0 text-sm text-muted-foreground">HSA / HRA</label>
                <DollarInput value={form.hsaHra} onChange={(v) => handleChange("hsaHra", v)} min="0" />
              </div>

              {/* Investments — multi-account */}
              <div className="space-y-2 rounded-md border border-dashed border-border p-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Investments</p>
                <MultiAccountRows
                  rows={calc.investAccounts}
                  onUpdate={updateInvestAccount}
                  onAdd={addInvestAccount}
                  onRemove={removeInvestAccount}
                  addLabel="Add account"
                  total={totalInvest}
                />
                {calc.investAccounts.length > 1 && (
                  <div className="border-t pt-2 flex justify-between text-sm font-semibold">
                    <span>Total Investments</span>
                    <span className="text-green-600 dark:text-green-400">{formatCurrency(totalInvest)}</span>
                  </div>
                )}
              </div>

              {/* 529 */}
              <div className="flex items-center gap-3">
                <label className="w-44 shrink-0 text-sm text-muted-foreground">529 Plan</label>
                <DollarInput value={form.plan529} onChange={(v) => handleChange("plan529", v)} min="0" />
              </div>

              {/* Teamworks Equity — pools × FMV */}
              <div className="space-y-3 rounded-md border border-dashed border-border p-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Teamworks Equity</p>
                <div className="flex items-center gap-3">
                  <label className="w-36 shrink-0 text-sm text-muted-foreground">Fair Market Value</label>
                  <DollarInput
                    value={calc.teamworksFMV}
                    onChange={(v) => setCalc((prev) => ({ ...prev, teamworksFMV: v }))}
                    min="0"
                  />
                </div>
                <div className="space-y-2 pt-1">
                  {calc.teamworksPools.map((pool) => (
                    <div key={pool.id} className="flex items-center gap-2">
                      <Input
                        type="text"
                        placeholder="Pool name"
                        value={pool.label}
                        onChange={(e) => updatePool(pool.id, "label", e.target.value)}
                        className="w-24 shrink-0 text-sm"
                      />
                      <Input
                        type="number"
                        step="1"
                        min="0"
                        placeholder="# options"
                        value={pool.options}
                        onChange={(e) => updatePool(pool.id, "options", e.target.value)}
                        className="w-28 text-sm"
                      />
                      <span className="text-xs text-muted-foreground shrink-0">×</span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {fmv > 0 ? formatCurrency(parseNum(pool.options) * fmv) : "—"}
                      </span>
                      {calc.teamworksPools.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removePool(pool.id)}
                          className="text-xs text-muted-foreground hover:text-red-500 px-1 ml-auto shrink-0"
                          title="Remove pool"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                  <div className="flex items-center justify-between pt-1">
                    <button
                      type="button"
                      onClick={addPool}
                      className="text-xs text-primary hover:underline"
                    >
                      + Add pool
                    </button>
                    <span className="text-xs text-muted-foreground">
                      Total: <span className="font-medium text-foreground">{formatCurrency(totalTeamworks)}</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Total Assets */}
              <div className="border-t pt-3">
                <div className="flex items-center justify-between font-semibold">
                  <span className="text-sm">Total Assets</span>
                  <span className="text-green-600 dark:text-green-400">{formatCurrency(totalAssets)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Liabilities + Net Worth */}
          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-red-600 dark:text-red-400">Liabilities</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { label: "Mortgage Balance", field: "mortgageBalance" as const },
                  { label: "Student Loans", field: "studentLoans" as const },
                  { label: "Personal Loans", field: "personalLoans" as const },
                ].map(({ label, field }) => (
                  <div key={field} className="flex items-center gap-3">
                    <label className="w-44 shrink-0 text-sm text-muted-foreground">{label}</label>
                    <DollarInput value={form[field]} onChange={(v) => handleChange(field, v)} min="0" />
                  </div>
                ))}
                <div className="border-t pt-3">
                  <div className="flex items-center justify-between font-semibold">
                    <span className="text-sm">Total Liabilities</span>
                    <span className="text-red-600 dark:text-red-400">{formatCurrency(totalLiabilities)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Net Worth Summary */}
            <Card className="border-2 border-primary/20">
              <CardContent className="pt-6">
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total Assets</span>
                    <span className="font-medium text-green-600 dark:text-green-400">{formatCurrency(totalAssets)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total Liabilities</span>
                    <span className="font-medium text-red-600 dark:text-red-400">{formatCurrency(totalLiabilities)}</span>
                  </div>
                  <div className="border-t pt-3">
                    <div className="flex justify-between">
                      <span className="text-lg font-bold">Net Worth</span>
                      <span className={`text-xl font-bold ${netWorth >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                        {formatCurrency(netWorth)}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={submitting} size="lg">
            {submitting ? "Saving..." : "Save Snapshot"}
          </Button>
        </div>
      </form>
    </div>
  );
}
