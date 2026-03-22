"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ExportButton } from "@/components/ui/export-button";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { format } from "date-fns";
import type { AmortizationRow } from "@/lib/mortgage";

interface Mortgage {
  id: number;
  label: string;
  loanAmount: number;
  annualRate: number;
  termYears: number;
  paymentsPerYear: number;
  firstPaymentDate: string;
  monthlyEscrow: number;
  pmi: number;
  isActive: boolean;
  housePrice: number;
  downPayment: number;
}

interface MortgageItem extends Mortgage {
  name: string;
  active: boolean;
  schedule: AmortizationRow[];
}

type SortKey = keyof AmortizationRow;
type SortDir = "asc" | "desc";

const TODAY = format(new Date(), "yyyy-MM-dd");
const CURRENT_MONTH = TODAY.slice(0, 7);
const PAGE_SIZE = 50;

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "paymentNumber", label: "#" },
  { key: "date", label: "Date" },
  { key: "payment", label: "Payment" },
  { key: "principal", label: "Principal" },
  { key: "interest", label: "Interest" },
  { key: "pmi", label: "PMI" },
  { key: "escrow", label: "Escrow" },
  { key: "extraPayment", label: "Extra" },
  { key: "totalPayment", label: "Total" },
  { key: "endingBalance", label: "Ending Balance" },
  { key: "homeEquity", label: "Home Equity" },
  { key: "equityPct", label: "Equity %" },
];

export default function AmortizationPage() {
  const [allMortgages, setAllMortgages] = useState<Mortgage[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [schedules, setSchedules] = useState<Map<number, AmortizationRow[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [showRemaining, setShowRemaining] = useState(false);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("paymentNumber");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/mortgage");
        if (res.ok) {
          const data: MortgageItem[] = await res.json();
          setAllMortgages(data);
          const activeItem = data.find((m) => m.active) ?? data[0];
          if (activeItem) {
            setSelectedId(activeItem.id);
            // Pre-load all schedules from the response
            const scheduleMap = new Map<number, AmortizationRow[]>();
            for (const item of data) {
              if (item.schedule) scheduleMap.set(item.id, item.schedule);
            }
            setSchedules(scheduleMap);
          }
        }
      } catch { /* ignore */ }
      finally { setLoading(false); }
    }
    load();
  }, []);

  const currentSchedule = selectedId ? (schedules.get(selectedId) ?? []) : [];
  const currentMortgage = allMortgages.find((m) => m.id === selectedId);

  const filteredRows = useMemo(() => {
    let rows = currentSchedule;
    if (showRemaining) rows = rows.filter((r) => r.date >= TODAY);
    return [...rows].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp = typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [currentSchedule, showRemaining, sortKey, sortDir]);

  const totalPages = Math.ceil(filteredRows.length / PAGE_SIZE);
  const pageRows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const totalMade = currentSchedule.filter((r) => r.date <= TODAY).length;
  const totalCount = currentSchedule.length;

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(1);
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-96 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  if (allMortgages.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Amortization Schedule</h1>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No mortgage data found. Please configure your mortgage in Settings.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Amortization Schedule</h1>
          <p className="text-muted-foreground">Full payment-by-payment breakdown of your mortgage.</p>
        </div>
        {selectedId && (
          <ExportButton
            baseUrl="/api/export/mortgage"
            params={{ id: String(selectedId) }}
            label="Export Schedule"
          />
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {allMortgages.length > 1 && (
          <Select
            value={selectedId ? String(selectedId) : ""}
            onValueChange={(v) => { setSelectedId(parseInt(v)); setPage(1); }}
          >
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Select mortgage" />
            </SelectTrigger>
            <SelectContent>
              {allMortgages.map((m) => (
                <SelectItem key={m.id} value={String(m.id)}>
                  {m.label}{m.isActive ? " (Active)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <div className="flex rounded-md border overflow-hidden">
          <button
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              !showRemaining ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
            }`}
            onClick={() => { setShowRemaining(false); setPage(1); }}
          >
            Show All
          </button>
          <button
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              showRemaining ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
            }`}
            onClick={() => { setShowRemaining(true); setPage(1); }}
          >
            Remaining Only
          </button>
        </div>

        <span className="ml-auto text-sm text-muted-foreground">
          {currentMortgage?.label ?? ""}
          {totalCount > 0 && ` — ${totalMade} of ${totalCount} payments made`}
        </span>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    {COLUMNS.map(({ key, label }) => (
                      <th
                        key={key}
                        className="cursor-pointer whitespace-nowrap px-3 py-2 text-left font-medium text-muted-foreground hover:text-foreground select-none"
                        onClick={() => handleSort(key)}
                      >
                        <span className="flex items-center gap-1">
                          {label}
                          {sortKey === key && <span className="text-xs">{sortDir === "asc" ? "↑" : "↓"}</span>}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => {
                    const isPast = row.date < TODAY;
                    const isCurrentMonth = row.date.slice(0, 7) === CURRENT_MONTH;

                    return (
                      <tr
                        key={row.paymentNumber}
                        className={[
                          "border-b last:border-0 transition-colors",
                          isCurrentMonth
                            ? "bg-primary/10 border-l-4 border-l-primary font-medium"
                            : isPast
                            ? "opacity-50"
                            : "hover:bg-muted/30",
                        ].join(" ")}
                      >
                        <td className="whitespace-nowrap px-3 py-2">{row.paymentNumber}</td>
                        <td className="whitespace-nowrap px-3 py-2">
                          {format(new Date(row.date + "T00:00:00"), "MMM yyyy")}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">{formatCurrency(row.payment)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-blue-600 dark:text-blue-400">{formatCurrency(row.principal)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-red-500">{formatCurrency(row.interest)}</td>
                        <td className="whitespace-nowrap px-3 py-2">
                          {row.pmi > 0 ? formatCurrency(row.pmi) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">{formatCurrency(row.escrow)}</td>
                        <td className="whitespace-nowrap px-3 py-2">
                          {row.extraPayment > 0 ? (
                            <span className="font-medium text-green-600 dark:text-green-400">{formatCurrency(row.extraPayment)}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 font-medium">{formatCurrency(row.totalPayment)}</td>
                        <td className="whitespace-nowrap px-3 py-2">{formatCurrency(row.endingBalance)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-green-600 dark:text-green-400">{formatCurrency(row.homeEquity)}</td>
                        <td className="whitespace-nowrap px-3 py-2">{formatPercent(row.equityPct)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t px-4 py-3">
              <span className="text-sm text-muted-foreground">
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filteredRows.length)} of{" "}
                {filteredRows.length} rows (Page {page} of {totalPages})
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
