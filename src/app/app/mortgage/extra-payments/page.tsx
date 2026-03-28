"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency, currentDate } from "@/lib/utils";
import { format } from "date-fns";
import { Upload } from "lucide-react";

interface ExtraPaymentRecord {
  id: string;
  paymentDate: string;
  amount: number;
  note?: string;
}

interface MortgageSummary {
  id: number;
  label: string;
  name: string;
  isActive: boolean;
  active: boolean;
  summary: {
    moneySaved: number;
    monthsSaved: number;
    payoffDate: string;
    totalExtraPayments: number;
    currentBalance: number;
    monthlyPayment: number;
    totalMonthlyPayment: number;
  };
}

export default function ExtraPaymentsPage() {
  const [mortgages, setMortgages] = useState<MortgageSummary[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [extraPayments, setExtraPayments] = useState<ExtraPaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Form state
  const [formDate, setFormDate] = useState(currentDate());
  const [formAmount, setFormAmount] = useState("");

  // Import state
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadMortgages = useCallback(async () => {
    try {
      const res = await fetch("/api/mortgage");
      if (res.ok) {
        const data: MortgageSummary[] = await res.json();
        setMortgages(data);
        const active = data.find((m) => m.active) ?? data[0];
        if (active && !selectedId) setSelectedId(active.id);
      }
    } catch {
      // ignore
    }
  }, [selectedId]);

  const loadExtraPayments = useCallback(async () => {
    if (!selectedId) return;
    try {
      const res = await fetch(`/api/mortgage/${selectedId}/extra-payment`);
      if (res.ok) {
        const data = await res.json();
        setExtraPayments(Array.isArray(data) ? data : data.payments ?? []);
      }
    } catch {
      // ignore
    }
  }, [selectedId]);

  useEffect(() => {
    async function init() {
      setLoading(true);
      await loadMortgages();
      setLoading(false);
    }
    init();
  }, [loadMortgages]);

  useEffect(() => {
    if (selectedId) {
      loadExtraPayments();
    }
  }, [selectedId, loadExtraPayments]);

  const mortgage = mortgages.find((m) => m.id === selectedId);
  const summary = mortgage?.summary;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId) return;
    const amount = parseFloat(formAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/mortgage/${selectedId}/extra-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentDate: formDate,
          amount,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? "Failed to add extra payment");
      }
      toast.success("Extra payment added");
      setFormAmount("");
      setFormDate(currentDate());
      await loadExtraPayments();
      await loadMortgages();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to add extra payment");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(paymentId: string) {
    if (!selectedId) return;
    setDeletingId(paymentId);
    try {
      const res = await fetch(
        `/api/mortgage/${selectedId}/extra-payment?paymentId=${paymentId}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? "Failed to delete payment");
      }
      toast.success("Payment deleted");
      await loadExtraPayments();
      await loadMortgages();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete payment");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !selectedId) return;
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("mortgageId", String(selectedId));
      const res = await fetch("/api/import/mortgage/extra-payments", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Import failed");
      toast.success(
        `Imported ${data.imported} payment${data.imported !== 1 ? "s" : ""}` +
        (data.totalSkipped > 0 ? ` (${data.totalSkipped} skipped)` : "")
      );
      await loadExtraPayments();
      await loadMortgages();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  if (!mortgage) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Extra Payments</h1>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No mortgage data found. Please configure your mortgage in Settings.
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalExtra = extraPayments.reduce((s, p) => s + p.amount, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Extra Payments</h1>
          <p className="text-muted-foreground">
            Track additional principal payments and see their impact.
          </p>
        </div>
        {mortgages.length > 1 && (
          <Select
            value={selectedId !== null ? String(selectedId) : ""}
            onValueChange={(v) => setSelectedId(parseInt(v))}
          >
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
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Total Extra Paid
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {formatCurrency(totalExtra)}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {extraPayments.length} payment{extraPayments.length !== 1 ? "s" : ""}
            </div>
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
              {formatCurrency(summary?.moneySaved ?? 0)}
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-emerald-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Months Saved
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {summary?.monthsSaved ?? 0}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">months off loan term</div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              New Payoff Date
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
              {summary?.payoffDate
                ? format(new Date(summary.payoffDate + "T00:00:00"), "MMM yyyy")
                : "—"}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Amortization impact summary */}
      {summary && (
        <Card className="border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Amortization Impact Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground uppercase tracking-wide">Current Balance</div>
                <div className="text-lg font-semibold">{formatCurrency(summary.currentBalance)}</div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground uppercase tracking-wide">Monthly P&I</div>
                <div className="text-lg font-semibold">{formatCurrency(summary.monthlyPayment)}</div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground uppercase tracking-wide">Monthly Total</div>
                <div className="text-lg font-semibold">{formatCurrency(summary.totalMonthlyPayment)}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add extra payment form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add Extra Payment</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">Date</label>
              <Input
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                className="w-40"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Amount</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  value={formAmount}
                  onChange={(e) => setFormAmount(e.target.value)}
                  className="w-36 pl-7"
                  required
                />
              </div>
            </div>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Adding..." : "Add Payment"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Import extra payments */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Import Extra Payments</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-muted-foreground">
            Upload a CSV or XLSX file with columns: <span className="font-medium">Date</span>,{" "}
            <span className="font-medium">Amount</span>.
            Dates should be in YYYY-MM-DD or M/D/YYYY format.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={handleImport}
            />
            <Button
              variant="outline"
              disabled={importing || !selectedId}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="mr-2 h-4 w-4" />
              {importing ? "Importing..." : "Choose File"}
            </Button>
            <span className="text-xs text-muted-foreground">CSV or XLSX accepted</span>
            <a
              href="/templates/extra-payments-template.csv"
              download
              className="text-xs text-primary underline-offset-4 hover:underline"
            >
              Download template
            </a>
          </div>
        </CardContent>
      </Card>

      {/* Extra payments table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Payment History</CardTitle>
          <span className="text-sm text-muted-foreground">
            {extraPayments.length} payment{extraPayments.length !== 1 ? "s" : ""} &bull;{" "}
            {formatCurrency(totalExtra)} total
          </span>
        </CardHeader>
        <CardContent className="p-0">
          {extraPayments.length === 0 ? (
            <div className="px-6 py-10 text-center text-muted-foreground">
              No extra payments recorded yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Date</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Amount</th>
                    <th className="px-4 py-2 text-right font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {extraPayments
                    .slice()
                    .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate))
                    .map((payment) => (
                      <tr key={payment.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="whitespace-nowrap px-4 py-2">
                          {format(new Date(payment.paymentDate + "T00:00:00"), "MMM d, yyyy")}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2 font-medium text-green-600 dark:text-green-400">
                          {formatCurrency(payment.amount)}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={deletingId === payment.id}
                            onClick={() => handleDelete(payment.id)}
                            className="text-red-600 hover:text-red-700 hover:border-red-300 dark:text-red-400 dark:hover:text-red-300"
                          >
                            {deletingId === payment.id ? "Deleting..." : "Delete"}
                          </Button>
                        </td>
                      </tr>
                    ))}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-muted/30">
                    <td className="px-4 py-2 font-semibold">Total</td>
                    <td className="px-4 py-2 font-semibold text-green-600 dark:text-green-400">
                      {formatCurrency(totalExtra)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
