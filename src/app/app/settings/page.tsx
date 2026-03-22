"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Lock, RefreshCw, Home, Trash2 } from "lucide-react";

interface MortgageRecord {
  id: number;
  label: string;
  housePrice: number;
  downPayment: number;
  loanAmount: number;
  annualRate: number;
  termYears: number;
  paymentsPerYear: number;
  firstPaymentDate: string;
  monthlyEscrow: number;
  pmi: number;
  isActive: boolean;
  notes?: string | null;
}

export default function SettingsPage() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // Mortgage form state
  const [existingMortgage, setExistingMortgage] = useState<MortgageRecord | null>(null);
  const [mortgageLoading, setMortgageLoading] = useState(true);
  const [mortgageSaving, setMortgageSaving] = useState(false);
  const [housePrice, setHousePrice] = useState("");
  const [downPayment, setDownPayment] = useState("");
  const [loanAmount, setLoanAmount] = useState("");
  const [annualRate, setAnnualRate] = useState("");
  const [termYears, setTermYears] = useState("30");
  const [firstPaymentDate, setFirstPaymentDate] = useState("");
  const [monthlyEscrow, setMonthlyEscrow] = useState("0");
  const [pmi, setPmi] = useState("0");
  const [mortgageNotes, setMortgageNotes] = useState("");

  // Reset state
  const [resetting, setResetting] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  useEffect(() => {
    async function loadMortgage() {
      try {
        const res = await fetch("/api/mortgage");
        if (res.ok) {
          const data: MortgageRecord[] = await res.json();
          const active = data.find((m) => m.isActive) ?? data[0];
          if (active) {
            setExistingMortgage(active);
            setHousePrice(String(active.housePrice));
            setDownPayment(String(active.downPayment));
            setLoanAmount(String(active.loanAmount));
            setAnnualRate(String((active.annualRate * 100).toFixed(4)));
            setTermYears(String(active.termYears));
            setFirstPaymentDate(active.firstPaymentDate);
            setMonthlyEscrow(String(active.monthlyEscrow));
            setPmi(String(active.pmi));
            setMortgageNotes(active.notes ?? "");
          }
        }
      } catch {
        // ignore
      } finally {
        setMortgageLoading(false);
      }
    }
    loadMortgage();
  }, []);

  async function handleMortgageSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      label: "Mortgage",
      housePrice: parseFloat(housePrice),
      downPayment: parseFloat(downPayment),
      loanAmount: parseFloat(loanAmount),
      annualRate: parseFloat(annualRate) / 100,
      termYears: parseInt(termYears),
      paymentsPerYear: 12,
      firstPaymentDate,
      monthlyEscrow: parseFloat(monthlyEscrow) || 0,
      pmi: parseFloat(pmi) || 0,
      isActive: true,
      notes: mortgageNotes.trim() || null,
    };
    setMortgageSaving(true);
    try {
      let res: Response;
      if (existingMortgage) {
        res = await fetch(`/api/mortgage/${existingMortgage.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch("/api/mortgage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      if (!res.ok) throw new Error("Failed to save mortgage");
      const saved: MortgageRecord = await res.json();
      setExistingMortgage(saved);
      toast.success(existingMortgage ? "Mortgage updated" : "Mortgage configured");
    } catch {
      toast.error("Failed to save mortgage");
    } finally {
      setMortgageSaving(false);
    }
  }

  async function handleReset() {
    setResetting(true);
    try {
      const res = await fetch("/api/settings/reset", { method: "POST" });
      if (!res.ok) throw new Error("Failed to reset data");
      toast.success("All data cleared successfully");
      setExistingMortgage(null);
      setHousePrice("");
      setDownPayment("");
      setLoanAmount("");
      setAnnualRate("");
      setTermYears("30");
      setFirstPaymentDate("");
      setMonthlyEscrow("0");
      setPmi("0");
      setMortgageNotes("");
    } catch {
      toast.error("Failed to clear data");
    } finally {
      setResetting(false);
      setShowResetConfirm(false);
    }
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/settings/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword }),
      });
      if (res.ok) {
        toast.success("Password updated successfully");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        toast.error("Failed to update password");
      }
    } catch {
      toast.error("Error updating password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Settings</h2>
        <p className="text-muted-foreground">Manage your Ledger configuration</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-4 w-4" />
            Change Password
          </CardTitle>
          <CardDescription>Update your login password</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePasswordChange} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">New Password</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                minLength={8}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm Password</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                "Update Password"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Mortgage Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Home className="h-4 w-4" />
            Mortgage Configuration
          </CardTitle>
          <CardDescription>
            {existingMortgage ? "Update your mortgage details." : "Set up your mortgage to enable amortization tracking."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {mortgageLoading ? (
            <div className="h-8 w-32 animate-pulse rounded bg-muted" />
          ) : (
            <form onSubmit={handleMortgageSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="housePrice">House Price ($)</Label>
                  <Input
                    id="housePrice"
                    type="number"
                    step="0.01"
                    min="0"
                    value={housePrice}
                    onChange={(e) => setHousePrice(e.target.value)}
                    placeholder="815000"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="downPayment">Down Payment ($)</Label>
                  <Input
                    id="downPayment"
                    type="number"
                    step="0.01"
                    min="0"
                    value={downPayment}
                    onChange={(e) => setDownPayment(e.target.value)}
                    placeholder="163000"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="loanAmount">Loan Amount ($)</Label>
                  <Input
                    id="loanAmount"
                    type="number"
                    step="0.01"
                    min="0"
                    value={loanAmount}
                    onChange={(e) => setLoanAmount(e.target.value)}
                    placeholder="652000"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="annualRate">Annual Interest Rate (%)</Label>
                  <Input
                    id="annualRate"
                    type="number"
                    step="0.001"
                    min="0"
                    max="100"
                    value={annualRate}
                    onChange={(e) => setAnnualRate(e.target.value)}
                    placeholder="5.99"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="termYears">Term (Years)</Label>
                  <Input
                    id="termYears"
                    type="number"
                    min="1"
                    max="50"
                    value={termYears}
                    onChange={(e) => setTermYears(e.target.value)}
                    placeholder="30"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="firstPaymentDate">First Payment Date</Label>
                  <Input
                    id="firstPaymentDate"
                    type="date"
                    value={firstPaymentDate}
                    onChange={(e) => setFirstPaymentDate(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="monthlyEscrow">Monthly Escrow ($)</Label>
                  <Input
                    id="monthlyEscrow"
                    type="number"
                    step="0.01"
                    min="0"
                    value={monthlyEscrow}
                    onChange={(e) => setMonthlyEscrow(e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pmi">Monthly PMI ($)</Label>
                  <Input
                    id="pmi"
                    type="number"
                    step="0.01"
                    min="0"
                    value={pmi}
                    onChange={(e) => setPmi(e.target.value)}
                    placeholder="0"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="mortgageNotes">Notes (optional)</Label>
                <Input
                  id="mortgageNotes"
                  type="text"
                  value={mortgageNotes}
                  onChange={(e) => setMortgageNotes(e.target.value)}
                  placeholder="e.g. Refinanced at 5.99% in 2026"
                  maxLength={500}
                />
              </div>
              <Button type="submit" disabled={mortgageSaving}>
                {mortgageSaving ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : existingMortgage ? (
                  "Update Mortgage"
                ) : (
                  "Save Mortgage"
                )}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="h-4 w-4" />
            Danger Zone
          </CardTitle>
          <CardDescription>
            Permanently delete all data. This cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {showResetConfirm ? (
            <div className="space-y-3">
              <p className="text-sm text-destructive font-medium">
                Are you sure? This will delete all transactions, budget data, net worth snapshots, and mortgage data.
              </p>
              <div className="flex gap-3">
                <Button
                  variant="destructive"
                  onClick={handleReset}
                  disabled={resetting}
                >
                  {resetting ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Clearing...
                    </>
                  ) : (
                    "Yes, Delete Everything"
                  )}
                </Button>
                <Button variant="outline" onClick={() => setShowResetConfirm(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="destructive"
              onClick={() => setShowResetConfirm(true)}
            >
              Clear All Data
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>About</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p><span className="font-medium text-foreground">Ledger</span> — Personal Finance Tracker</p>
          <p>Self-hosted, open source, no telemetry.</p>
          <p>Stack: Next.js 14 · SQLite · Drizzle ORM · next-auth · Tailwind CSS · shadcn/ui · Recharts</p>
        </CardContent>
      </Card>
    </div>
  );
}
