"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency, currentDate } from "@/lib/utils";

interface SnapshotFormData {
  date: string;
  // Assets
  checkingAccount: string;
  savingsAccount: string;
  homeEquity: string;
  retirement401k: string;
  hsaHra: string;
  investments: string;
  plan529: string;
  teamworksEquity: string;
  // Liabilities
  mortgageBalance: string;
  studentLoans: string;
  personalLoans: string;
}

const defaultForm: SnapshotFormData = {
  date: currentDate(),
  checkingAccount: "",
  savingsAccount: "",
  homeEquity: "",
  retirement401k: "",
  hsaHra: "",
  investments: "",
  plan529: "",
  teamworksEquity: "",
  mortgageBalance: "",
  studentLoans: "",
  personalLoans: "",
};

function parseNum(val: string): number {
  const n = parseFloat(val.replace(/[^0-9.-]/g, ""));
  return isNaN(n) ? 0 : n;
}

export default function NetWorthSnapshotPage() {
  const [form, setForm] = useState<SnapshotFormData>(defaultForm);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function loadLatest() {
      try {
        const res = await fetch("/api/net-worth/latest");
        if (res.ok) {
          const data = await res.json();
          if (data) {
            setForm({
              date: currentDate(),
              checkingAccount: data.checkingAccount?.toString() ?? "",
              savingsAccount: data.savingsAccount?.toString() ?? "",
              homeEquity: data.homeEquity?.toString() ?? "",
              retirement401k: data.retirement401k?.toString() ?? "",
              hsaHra: data.hsaHra?.toString() ?? "",
              investments: data.investments?.toString() ?? "",
              plan529: data.plan529?.toString() ?? "",
              teamworksEquity: data.teamworksEquity?.toString() ?? "",
              mortgageBalance: data.mortgageBalance?.toString() ?? "",
              studentLoans: data.studentLoans?.toString() ?? "",
              personalLoans: data.personalLoans?.toString() ?? "",
            });
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

  const totalAssets =
    parseNum(form.checkingAccount) +
    parseNum(form.savingsAccount) +
    parseNum(form.homeEquity) +
    parseNum(form.retirement401k) +
    parseNum(form.hsaHra) +
    parseNum(form.investments) +
    parseNum(form.plan529) +
    parseNum(form.teamworksEquity);

  const totalLiabilities =
    parseNum(form.mortgageBalance) +
    parseNum(form.studentLoans) +
    parseNum(form.personalLoans);

  const netWorth = totalAssets - totalLiabilities;

  function handleChange(field: keyof SnapshotFormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const body = {
        date: form.date,
        checkingAccount: parseNum(form.checkingAccount),
        savingsAccount: parseNum(form.savingsAccount),
        homeEquity: parseNum(form.homeEquity),
        retirement401k: parseNum(form.retirement401k),
        hsaHra: parseNum(form.hsaHra),
        investments: parseNum(form.investments),
        plan529: parseNum(form.plan529),
        teamworksEquity: parseNum(form.teamworksEquity),
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">New Net Worth Snapshot</h1>
        <p className="text-muted-foreground">
          Enter your current balances. Fields are pre-filled from your latest snapshot.
        </p>
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
              <CardTitle className="text-base text-green-600 dark:text-green-400">
                Assets
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { label: "Checking Account", field: "checkingAccount" as const },
                { label: "Savings Account", field: "savingsAccount" as const },
                { label: "Home Equity", field: "homeEquity" as const },
                { label: "401K / Retirement", field: "retirement401k" as const },
                { label: "HSA / HRA", field: "hsaHra" as const },
                { label: "Investments", field: "investments" as const },
                { label: "529 Plan", field: "plan529" as const },
                { label: "Teamworks Equity", field: "teamworksEquity" as const },
              ].map(({ label, field }) => (
                <div key={field} className="flex items-center gap-3">
                  <label className="w-44 shrink-0 text-sm text-muted-foreground">
                    {label}
                  </label>
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                      $
                    </span>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={form[field]}
                      onChange={(e) => handleChange(field, e.target.value)}
                      className="pl-7"
                    />
                  </div>
                </div>
              ))}
              <div className="border-t pt-3">
                <div className="flex items-center justify-between font-semibold">
                  <span className="text-sm">Total Assets</span>
                  <span className="text-green-600 dark:text-green-400">
                    {formatCurrency(totalAssets)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Liabilities */}
          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-red-600 dark:text-red-400">
                  Liabilities
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { label: "Mortgage Balance", field: "mortgageBalance" as const },
                  { label: "Student Loans", field: "studentLoans" as const },
                  { label: "Personal Loans", field: "personalLoans" as const },
                ].map(({ label, field }) => (
                  <div key={field} className="flex items-center gap-3">
                    <label className="w-44 shrink-0 text-sm text-muted-foreground">
                      {label}
                    </label>
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                        $
                      </span>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={form[field]}
                        onChange={(e) => handleChange(field, e.target.value)}
                        className="pl-7"
                      />
                    </div>
                  </div>
                ))}
                <div className="border-t pt-3">
                  <div className="flex items-center justify-between font-semibold">
                    <span className="text-sm">Total Liabilities</span>
                    <span className="text-red-600 dark:text-red-400">
                      {formatCurrency(totalLiabilities)}
                    </span>
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
                    <span className="font-medium text-green-600 dark:text-green-400">
                      {formatCurrency(totalAssets)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total Liabilities</span>
                    <span className="font-medium text-red-600 dark:text-red-400">
                      {formatCurrency(totalLiabilities)}
                    </span>
                  </div>
                  <div className="border-t pt-3">
                    <div className="flex justify-between">
                      <span className="text-lg font-bold">Net Worth</span>
                      <span
                        className={`text-xl font-bold ${
                          netWorth >= 0
                            ? "text-green-600 dark:text-green-400"
                            : "text-red-600 dark:text-red-400"
                        }`}
                      >
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
