"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatCurrency, isoToMonthLabel, currentMonth } from "@/lib/utils";
import { Pencil, Trash2, Plus, Check, X } from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────

interface TxRow {
  id: number;
  date: string;
  amount: number;
  description: string | null;
  categoryId: number;
  categoryName: string;
  parentCategory: string;
  isIncomeSource: boolean;
}

interface Category {
  id: number;
  name: string;
  parentCategory: string;
  isIncomeSource: boolean;
  sortOrder: number;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

const ALL = "__all__";

// ─── Transactions Tab ──────────────────────────────────────────────────────

function TransactionsTab({ categories }: { categories: Category[] }) {
  const [startMonth, setStartMonth] = useState(currentMonth());
  const [endMonth, setEndMonth] = useState(currentMonth());
  const [filterGroupKey, setFilterGroupKey] = useState(ALL);
  const [filterCatId, setFilterCatId] = useState(ALL);

  const [rows, setRows] = useState<TxRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const [editTx, setEditTx] = useState<TxRow | null>(null);
  const [editMonth, setEditMonth] = useState("");
  const [editCatId, setEditCatId] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [bulkError, setBulkError] = useState<string | null>(null);

  const parentGroups = useMemo(() =>
    categories.reduce<Record<string, Category[]>>((acc, c) => {
      if (!acc[c.parentCategory]) acc[c.parentCategory] = [];
      acc[c.parentCategory].push(c);
      return acc;
    }, {}), [categories]);

  const groupKeys = useMemo(() => Object.keys(parentGroups).sort(), [parentGroups]);

  const filteredCatOptions = useMemo(() =>
    filterGroupKey === ALL ? categories : (parentGroups[filterGroupKey] ?? []),
    [filterGroupKey, categories, parentGroups]);

  const loadRows = useCallback(async () => {
    setLoading(true);
    setBulkError(null);
    try {
      const params = new URLSearchParams({ startMonth, endMonth });
      if (filterCatId !== ALL) params.set("categoryId", filterCatId);
      const res = await fetch(`/api/budget/transactions?${params}`);
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
      setSelected(new Set());
    } catch {
      setBulkError("Failed to load transactions.");
    } finally {
      setLoading(false);
    }
  }, [startMonth, endMonth, filterCatId]);

  useEffect(() => { loadRows(); }, [loadRows]);

  // Client-side group filter (category filter is server-side, group is client-side)
  const displayRows = useMemo(() =>
    filterGroupKey === ALL
      ? rows
      : rows.filter((r) => r.parentCategory === filterGroupKey),
    [rows, filterGroupKey]);

  const total = useMemo(() =>
    displayRows.reduce((s, r) => s + r.amount, 0), [displayRows]);

  function toggleSelect(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === displayRows.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(displayRows.map((r) => r.id)));
    }
  }

  async function deleteSelected() {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} transaction${selected.size !== 1 ? "s" : ""}?`)) return;
    setBulkError(null);
    try {
      const ids = Array.from(selected).join(",");
      const res = await fetch(`/api/budget/transactions?ids=${ids}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      await loadRows();
    } catch {
      setBulkError("Failed to delete selected transactions.");
    }
  }

  async function deleteByRange() {
    const label = startMonth === endMonth
      ? isoToMonthLabel(startMonth)
      : `${isoToMonthLabel(startMonth)} – ${isoToMonthLabel(endMonth)}`;
    const matching = filterGroupKey === ALL ? rows.length : displayRows.length;
    if (!confirm(`Delete ALL ${matching} displayed transaction${matching !== 1 ? "s" : ""} (${label})? This cannot be undone.`)) return;
    setBulkError(null);
    try {
      // If we have a category filter, delete selected rows instead
      if (filterCatId !== ALL || filterGroupKey !== ALL) {
        const ids = displayRows.map((r) => r.id).join(",");
        if (!ids) { await loadRows(); return; }
        const res = await fetch(`/api/budget/transactions?ids=${ids}`, { method: "DELETE" });
        if (!res.ok) throw new Error();
      } else {
        const params = new URLSearchParams({ startMonth, endMonth });
        const res = await fetch(`/api/budget/transactions?${params}`, { method: "DELETE" });
        if (!res.ok) throw new Error();
      }
      await loadRows();
    } catch {
      setBulkError("Failed to delete transactions.");
    }
  }

  function openEdit(tx: TxRow) {
    setEditTx(tx);
    setEditMonth(tx.date.slice(0, 7));
    setEditCatId(String(tx.categoryId));
    setEditAmount(String(tx.amount));
    setEditDesc(tx.description ?? "");
    setEditError(null);
  }

  async function saveEdit() {
    if (!editTx) return;
    setEditError(null);
    const amt = parseFloat(editAmount);
    if (isNaN(amt) || amt <= 0) { setEditError("Amount must be a positive number."); return; }
    setEditSaving(true);
    try {
      const res = await fetch("/api/budget/transactions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editTx.id,
          month: editMonth,
          categoryId: parseInt(editCatId),
          amount: amt,
          description: editDesc.trim() || null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Save failed");
      setEditTx(null);
      await loadRows();
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setEditSaving(false);
    }
  }

  async function deleteSingle(id: number) {
    if (!confirm("Delete this transaction?")) return;
    try {
      await fetch(`/api/budget/transactions?id=${id}`, { method: "DELETE" });
      setRows((prev) => prev.filter((r) => r.id !== id));
      setSelected((prev) => { const n = new Set(prev); n.delete(id); return n; });
    } catch {
      alert("Delete failed");
    }
  }

  const allSelected = displayRows.length > 0 && selected.size === displayRows.length;
  const someSelected = selected.size > 0;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">From Month</label>
              <input
                type="month"
                value={startMonth}
                onChange={(e) => setStartMonth(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">To Month</label>
              <input
                type="month"
                value={endMonth}
                onChange={(e) => setEndMonth(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Group</label>
              <Select value={filterGroupKey} onValueChange={(v) => { setFilterGroupKey(v); setFilterCatId(ALL); }}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All groups</SelectItem>
                  {groupKeys.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Category</label>
              <Select value={filterCatId} onValueChange={setFilterCatId}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All categories</SelectItem>
                  {filteredCatOptions.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">
          {displayRows.length} row{displayRows.length !== 1 ? "s" : ""}
          {displayRows.length > 0 && ` · ${formatCurrency(total)}`}
        </span>
        <div className="ml-auto flex gap-2">
          {someSelected && (
            <Button variant="destructive" size="sm" onClick={deleteSelected}>
              Delete {selected.size} selected
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={deleteByRange} className="text-red-600 border-red-200 hover:bg-red-50">
            Delete all {displayRows.length > 0 ? `(${displayRows.length})` : "matching"}
          </Button>
        </div>
      </div>

      {bulkError && <p className="text-sm text-red-600">{bulkError}</p>}

      {/* Table */}
      <div className="rounded-md border overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="w-10 px-3 py-2">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="h-4 w-4 rounded border-input"
                />
              </th>
              <th className="px-3 py-2 text-left font-medium">Month</th>
              <th className="px-3 py-2 text-left font-medium">Group</th>
              <th className="px-3 py-2 text-left font-medium">Category</th>
              <th className="px-3 py-2 text-right font-medium">Amount</th>
              <th className="px-3 py-2 text-left font-medium">Description</th>
              <th className="px-3 py-2 text-center font-medium w-20">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">Loading…</td>
              </tr>
            ) : displayRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">No transactions found.</td>
              </tr>
            ) : (
              displayRows.map((row) => (
                <tr key={row.id} className={`border-t hover:bg-muted/30 ${selected.has(row.id) ? "bg-blue-50 dark:bg-blue-950/20" : ""}`}>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(row.id)}
                      onChange={() => toggleSelect(row.id)}
                      className="h-4 w-4 rounded border-input"
                    />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{isoToMonthLabel(row.date.slice(0, 7))}</td>
                  <td className="px-3 py-2 text-muted-foreground">{row.parentCategory}</td>
                  <td className="px-3 py-2">{row.categoryName}</td>
                  <td className={`px-3 py-2 text-right font-medium whitespace-nowrap ${row.isIncomeSource ? "text-green-600" : ""}`}>
                    {formatCurrency(row.amount)}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground max-w-xs truncate">{row.description}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => openEdit(row)} className="p-1 hover:text-blue-600 transition-colors" title="Edit">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => deleteSingle(row.id)} className="p-1 hover:text-red-600 transition-colors" title="Delete">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editTx} onOpenChange={(open) => { if (!open) setEditTx(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Transaction</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">Month</label>
              <input
                type="month"
                value={editMonth}
                onChange={(e) => setEditMonth(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Category</label>
              <Select value={editCatId} onValueChange={setEditCatId}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(parentGroups).map(([parent, cats]) => (
                    <SelectGroup key={parent}>
                      <SelectLabel>{parent}</SelectLabel>
                      {cats.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Amount ($)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Description</label>
              <input
                type="text"
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            {editError && <p className="text-sm text-red-600">{editError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTx(null)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={editSaving}>
              {editSaving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Categories Tab ────────────────────────────────────────────────────────

function CategoriesTab({
  categories,
  onRefresh,
}: {
  categories: Category[];
  onRefresh: () => void;
}) {
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editGroup, setEditGroup] = useState("");
  const [editSort, setEditSort] = useState("");
  const [editIsIncome, setEditIsIncome] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addGroup, setAddGroup] = useState("");
  const [addSort, setAddSort] = useState("");
  const [addIsIncome, setAddIsIncome] = useState(false);
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [addGroupOpen, setAddGroupOpen] = useState(false);
  const [addGroupName, setAddGroupName] = useState("");
  const [addGroupError, setAddGroupError] = useState<string | null>(null);

  const [renameGroupOpen, setRenameGroupOpen] = useState(false);
  const [renameGroupOldName, setRenameGroupOldName] = useState("");
  const [renameGroupNewName, setRenameGroupNewName] = useState("");
  const [renameGroupSaving, setRenameGroupSaving] = useState(false);
  const [renameGroupError, setRenameGroupError] = useState<string | null>(null);

  const [deleteGroupError, setDeleteGroupError] = useState<string | null>(null);

  const grouped = useMemo(() =>
    categories.reduce<Record<string, Category[]>>((acc, c) => {
      if (!acc[c.parentCategory]) acc[c.parentCategory] = [];
      acc[c.parentCategory].push(c);
      return acc;
    }, {}), [categories]);

  const groupKeys = useMemo(() =>
    Object.keys(grouped).sort((a, b) => {
      const minA = Math.min(...grouped[a].map((c) => c.sortOrder));
      const minB = Math.min(...grouped[b].map((c) => c.sortOrder));
      return minA - minB;
    }), [grouped]);

  const existingGroups = useMemo(() => Object.keys(grouped).sort(), [grouped]);

  function startEdit(c: Category) {
    setEditId(c.id);
    setEditName(c.name);
    setEditGroup(c.parentCategory);
    setEditSort(String(c.sortOrder));
    setEditIsIncome(c.isIncomeSource);
    setEditError(null);
  }

  function cancelEdit() {
    setEditId(null);
    setEditError(null);
  }

  async function saveEdit(id: number) {
    setEditError(null);
    setEditSaving(true);
    try {
      const res = await fetch("/api/budget/categories", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          name: editName.trim(),
          parentCategory: editGroup.trim(),
          sortOrder: editSort ? parseInt(editSort) : 0,
          isIncomeSource: editIsIncome,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Save failed");
      setEditId(null);
      onRefresh();
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setEditSaving(false);
    }
  }

  async function deleteCategory(id: number, name: string) {
    setDeleteError(null);
    if (!confirm(`Delete category "${name}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/budget/categories?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        setDeleteError(err.error ?? "Delete failed");
        return;
      }
      onRefresh();
    } catch {
      setDeleteError("Delete failed");
    }
  }

  async function addCategory() {
    setAddError(null);
    if (!addName.trim() || !addGroup.trim()) { setAddError("Name and group are required."); return; }
    setAddSaving(true);
    try {
      const res = await fetch("/api/budget/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: addName.trim(),
          parentCategory: addGroup.trim(),
          sortOrder: addSort ? parseInt(addSort) : 0,
          isIncomeSource: addIsIncome,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to add");
      setAddOpen(false);
      setAddName(""); setAddGroup(""); setAddSort("");
      setAddIsIncome(false);
      onRefresh();
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "Add failed");
    } finally {
      setAddSaving(false);
    }
  }

  function openAddGroup() {
    setAddGroupName("");
    setAddGroupError(null);
    setAddGroupOpen(true);
  }

  function confirmAddGroup() {
    const name = addGroupName.trim();
    if (!name) { setAddGroupError("Group name is required."); return; }
    if (existingGroups.includes(name)) { setAddGroupError("A group with this name already exists."); return; }
    setAddGroupOpen(false);
    setAddGroup(name);
    setAddName("");
    setAddSort("");
    setAddIsIncome(false);
    setAddError(null);
    setAddOpen(true);
  }

  function openRenameGroup(name: string) {
    setRenameGroupOldName(name);
    setRenameGroupNewName(name);
    setRenameGroupError(null);
    setRenameGroupOpen(true);
  }

  async function saveRenameGroup() {
    const newName = renameGroupNewName.trim();
    if (!newName) { setRenameGroupError("Group name is required."); return; }
    if (newName === renameGroupOldName) { setRenameGroupOpen(false); return; }
    if (existingGroups.includes(newName)) { setRenameGroupError("A group with this name already exists."); return; }
    setRenameGroupSaving(true);
    setRenameGroupError(null);
    try {
      const res = await fetch("/api/budget/groups", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldName: renameGroupOldName, newName }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Rename failed");
      setRenameGroupOpen(false);
      onRefresh();
    } catch (e) {
      setRenameGroupError(e instanceof Error ? e.message : "Rename failed");
    } finally {
      setRenameGroupSaving(false);
    }
  }

  async function deleteGroup(name: string) {
    setDeleteGroupError(null);
    const catCount = grouped[name]?.length ?? 0;
    if (!confirm(`Delete group "${name}" and all ${catCount} of its categories? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/budget/groups?name=${encodeURIComponent(name)}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        setDeleteGroupError(err.error ?? "Delete failed");
        return;
      }
      onRefresh();
    } catch {
      setDeleteGroupError("Delete failed");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{categories.length} categories across {groupKeys.length} groups</p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={openAddGroup}>
            <Plus className="h-4 w-4 mr-1" /> Add Group
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Add Category
          </Button>
        </div>
      </div>

      {deleteError && <p className="text-sm text-red-600">{deleteError}</p>}
      {deleteGroupError && <p className="text-sm text-red-600">{deleteGroupError}</p>}

      {groupKeys.map((group) => (
        <Card key={group}>
          <CardHeader className="pb-2 pt-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                {group}
              </CardTitle>
              <div className="flex items-center gap-1">
                <button onClick={() => openRenameGroup(group)} className="p-1 hover:text-blue-600 transition-colors" title="Rename group">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => deleteGroup(group)} className="p-1 hover:text-red-600 transition-colors" title="Delete group">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pb-3">
            <div className="rounded-md border overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Name</th>
                    <th className="px-3 py-2 text-left font-medium">Group</th>
                    <th className="px-3 py-2 text-center font-medium">Sort</th>
                    <th className="px-3 py-2 text-center font-medium">Type</th>
                    <th className="px-3 py-2 text-center font-medium w-20">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {grouped[group].map((cat) =>
                    editId === cat.id ? (
                      <tr key={cat.id} className="border-t bg-blue-50 dark:bg-blue-950/20">
                        <td className="px-2 py-1">
                          <input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="h-7 w-full rounded border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                        </td>
                        <td className="px-2 py-1">
                          <input
                            value={editGroup}
                            onChange={(e) => setEditGroup(e.target.value)}
                            list="group-datalist"
                            className="h-7 w-full rounded border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                          <datalist id="group-datalist">
                            {existingGroups.map((g) => <option key={g} value={g} />)}
                          </datalist>
                        </td>
                        <td className="px-2 py-1">
                          <input
                            type="number"
                            value={editSort}
                            onChange={(e) => setEditSort(e.target.value)}
                            className="h-7 w-16 rounded border border-input bg-background px-2 text-sm text-center focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                        </td>
                        <td className="px-2 py-1">
                          <label className="flex items-center gap-1 cursor-pointer text-xs">
                            <input type="checkbox" checked={editIsIncome} onChange={(e) => setEditIsIncome(e.target.checked)} className="h-3 w-3" />
                            Income
                          </label>
                        </td>
                        <td className="px-2 py-1">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => saveEdit(cat.id)} disabled={editSaving} className="p-1 hover:text-green-600 transition-colors" title="Save">
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={cancelEdit} className="p-1 hover:text-red-600 transition-colors" title="Cancel">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          {editError && <p className="text-xs text-red-600 mt-1">{editError}</p>}
                        </td>
                      </tr>
                    ) : (
                      <tr key={cat.id} className="border-t hover:bg-muted/30">
                        <td className="px-3 py-2 font-medium">{cat.name}</td>
                        <td className="px-3 py-2 text-muted-foreground">{cat.parentCategory}</td>
                        <td className="px-3 py-2 text-center text-muted-foreground">{cat.sortOrder}</td>
                        <td className="px-3 py-2 text-center text-xs text-muted-foreground">
                          {cat.isIncomeSource ? "Income" : "Expense"}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => startEdit(cat)} className="p-1 hover:text-blue-600 transition-colors" title="Edit">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => deleteCategory(cat.id, cat.name)} className="p-1 hover:text-red-600 transition-colors" title="Delete">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Add Group Dialog */}
      <Dialog open={addGroupOpen} onOpenChange={setAddGroupOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Group</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">Group Name</label>
              <input
                value={addGroupName}
                onChange={(e) => setAddGroupName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") confirmAddGroup(); }}
                placeholder="e.g. Food"
                autoFocus
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            {addGroupError && <p className="text-sm text-red-600">{addGroupError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddGroupOpen(false)}>Cancel</Button>
            <Button onClick={confirmAddGroup}>Continue →</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Group Dialog */}
      <Dialog open={renameGroupOpen} onOpenChange={setRenameGroupOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename Group</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">Group Name</label>
              <input
                value={renameGroupNewName}
                onChange={(e) => setRenameGroupNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveRenameGroup(); }}
                autoFocus
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            {renameGroupError && <p className="text-sm text-red-600">{renameGroupError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameGroupOpen(false)}>Cancel</Button>
            <Button onClick={saveRenameGroup} disabled={renameGroupSaving}>
              {renameGroupSaving ? "Saving…" : "Rename"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Category Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Category</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium">Name</label>
                <input
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  placeholder="e.g. Groceries"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Group</label>
                <input
                  value={addGroup}
                  onChange={(e) => setAddGroup(e.target.value)}
                  list="add-group-datalist"
                  placeholder="e.g. Food"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <datalist id="add-group-datalist">
                  {existingGroups.map((g) => <option key={g} value={g} />)}
                </datalist>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Sort Order</label>
              <input
                type="number"
                value={addSort}
                onChange={(e) => setAddSort(e.target.value)}
                placeholder="0"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="checkbox" checked={addIsIncome} onChange={(e) => setAddIsIncome(e.target.checked)} className="h-4 w-4 rounded" />
                Income source
              </label>
            </div>
            {addError && <p className="text-sm text-red-600">{addError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={addCategory} disabled={addSaving}>
              {addSaving ? "Adding…" : "Add Category"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Net Worth Fields Tab ──────────────────────────────────────────────────

const NW_FIELDS = [
  { key: "checking", defaultLabel: "Checking Account", type: "Asset" },
  { key: "savings", defaultLabel: "Savings Account", type: "Asset" },
  { key: "homeEquity", defaultLabel: "Home Equity", type: "Asset" },
  { key: "retirement401k", defaultLabel: "401K / Retirement", type: "Asset" },
  { key: "hsaHra", defaultLabel: "HSA / HRA", type: "Asset" },
  { key: "investments", defaultLabel: "Investments", type: "Asset" },
  { key: "plan529", defaultLabel: "529 Plan", type: "Asset" },
  { key: "teamworksEquity", defaultLabel: "Teamworks Equity", type: "Asset" },
  { key: "mortgageBalance", defaultLabel: "Mortgage Balance", type: "Liability" },
  { key: "studentLoans", defaultLabel: "Student Loans", type: "Liability" },
  { key: "personalLoans", defaultLabel: "Personal Loans", type: "Liability" },
] as const;

function NetWorthFieldsTab() {
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [editKey, setEditKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/settings/net-worth-labels")
      .then((r) => r.json())
      .then((d: Record<string, string>) => setLabels(d))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  function getLabel(key: string, defaultLabel: string) {
    return labels[key] ?? defaultLabel;
  }

  function startEdit(key: string, currentLabel: string) {
    setEditKey(key);
    setEditValue(currentLabel);
    setError(null);
  }

  async function saveEdit() {
    if (!editKey) return;
    const trimmed = editValue.trim();
    if (!trimmed) { setError("Label cannot be empty."); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/net-worth-labels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [editKey]: trimmed }),
      });
      if (!res.ok) throw new Error("Save failed");
      setLabels((prev) => ({ ...prev, [editKey]: trimmed }));
      setEditKey(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function resetLabel(key: string) {
    const field = NW_FIELDS.find((f) => f.key === key);
    if (!field) return;
    setSaving(true);
    try {
      await fetch("/api/settings/net-worth-labels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: field.defaultLabel }),
      });
      setLabels((prev) => ({ ...prev, [key]: field.defaultLabel }));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="h-24 animate-pulse rounded-md bg-muted" />;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Rename the display labels for your Net Worth fields. These names appear throughout the app.
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {(["Asset", "Liability"] as const).map((type) => (
        <Card key={type}>
          <CardHeader className="pb-2 pt-4">
            <CardTitle className={`text-sm font-semibold uppercase tracking-wider ${type === "Asset" ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
              {type === "Asset" ? "Assets" : "Liabilities"}
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3">
            <div className="rounded-md border overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Field Key</th>
                    <th className="px-3 py-2 text-left font-medium">Display Label</th>
                    <th className="px-3 py-2 text-center font-medium w-24">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {NW_FIELDS.filter((f) => f.type === type).map((field) => (
                    editKey === field.key ? (
                      <tr key={field.key} className="border-t bg-blue-50 dark:bg-blue-950/20">
                        <td className="px-3 py-2 text-muted-foreground font-mono text-xs">{field.key}</td>
                        <td className="px-2 py-1">
                          <input
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditKey(null); }}
                            autoFocus
                            className="h-7 w-full rounded border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                        </td>
                        <td className="px-2 py-1">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={saveEdit} disabled={saving} className="p-1 hover:text-green-600 transition-colors" title="Save">
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => setEditKey(null)} className="p-1 hover:text-red-600 transition-colors" title="Cancel">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr key={field.key} className="border-t hover:bg-muted/30">
                        <td className="px-3 py-2 text-muted-foreground font-mono text-xs">{field.key}</td>
                        <td className="px-3 py-2 font-medium">{getLabel(field.key, field.defaultLabel)}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => startEdit(field.key, getLabel(field.key, field.defaultLabel))}
                              className="p-1 hover:text-blue-600 transition-colors" title="Rename"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            {labels[field.key] && labels[field.key] !== field.defaultLabel && (
                              <button
                                onClick={() => resetLabel(field.key)}
                                className="p-1 hover:text-muted-foreground transition-colors text-xs"
                                title="Reset to default"
                              >
                                ↺
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function DataManagerPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCats, setLoadingCats] = useState(true);

  const loadCategories = useCallback(() => {
    setLoadingCats(true);
    fetch("/api/budget/categories")
      .then((r) => r.json())
      .then((data: Category[]) => setCategories(Array.isArray(data) ? data : []))
      .catch(console.error)
      .finally(() => setLoadingCats(false));
  }, []);

  useEffect(() => { loadCategories(); }, [loadCategories]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Data Manager</h1>
        <p className="text-muted-foreground text-sm">
          View, filter, edit, and delete expense data and categories
        </p>
      </div>

      <Tabs defaultValue="transactions">
        <TabsList>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="categories">Categories & Groups</TabsTrigger>
          <TabsTrigger value="networth">Net Worth Fields</TabsTrigger>
        </TabsList>

        <TabsContent value="transactions" className="mt-4">
          {loadingCats ? (
            <div className="h-24 animate-pulse rounded-md bg-muted" />
          ) : (
            <TransactionsTab categories={categories} />
          )}
        </TabsContent>

        <TabsContent value="categories" className="mt-4">
          {loadingCats ? (
            <div className="h-24 animate-pulse rounded-md bg-muted" />
          ) : (
            <CategoriesTab categories={categories} onRefresh={loadCategories} />
          )}
        </TabsContent>

        <TabsContent value="networth" className="mt-4">
          <NetWorthFieldsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
