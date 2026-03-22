"use client";

import { useState, useRef, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ImportResult {
  imported?: number;
  targetsImported?: number;
  monthsImported?: string[];
  skipped?: string[];
  totalSkipped?: number;
  error?: string;
}

interface ImportDialogProps {
  /** The import API endpoint, e.g. "/api/import/transactions" */
  apiUrl: string;
  /** Title shown in the dialog */
  title: string;
  /** Description / instructions shown to the user */
  description?: string;
  /** Optional accepted file types */
  accept?: string;
  /** Called after a successful import */
  onSuccess?: (result: ImportResult) => void;
  /** Trigger button label */
  triggerLabel?: string;
  triggerVariant?: "default" | "outline" | "ghost" | "secondary";
  triggerSize?: "default" | "sm" | "lg" | "icon";
  className?: string;
}

export function ImportDialog({
  apiUrl,
  title,
  description,
  accept = ".csv,.xlsx,.xls",
  onSuccess,
  triggerLabel = "Import",
  triggerVariant = "outline",
  triggerSize = "sm",
  className,
}: ImportDialogProps) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setFile(null);
    setResult(null);
  }

  function handleFileChange(f: File | null) {
    setFile(f);
    setResult(null);
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFileChange(f);
  }, []);

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(apiUrl, { method: "POST", body: fd });
      const json: ImportResult = await res.json();
      setResult(json);
      if (!json.error && onSuccess) onSuccess(json);
    } catch (e) {
      setResult({ error: e instanceof Error ? e.message : "Upload failed" });
    } finally {
      setUploading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant={triggerVariant} size={triggerSize} className={className}>
          {triggerLabel}
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && (
            <p className="text-sm text-muted-foreground mt-1">{description}</p>
          )}
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Drop zone */}
          <div
            className={cn(
              "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors cursor-pointer",
              dragging
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/30 hover:border-primary/60 hover:bg-muted/30"
            )}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <svg className="h-10 w-10 text-muted-foreground/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <div className="space-y-1">
              <p className="text-sm font-medium">
                {file ? file.name : "Drop a file here or click to browse"}
              </p>
              <p className="text-xs text-muted-foreground">
                Accepts CSV and Excel (.xlsx) files
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept={accept}
              className="sr-only"
              onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
            />
          </div>

          {/* Result */}
          {result && (
            <div className={cn(
              "rounded-lg border p-4 text-sm",
              result.error ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
                : "border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-300"
            )}>
              {result.error ? (
                <p className="font-medium">Error: {result.error}</p>
              ) : (
                <div className="space-y-1">
                  <p className="font-medium">
                    Import complete — {result.imported ?? 0} row(s) imported
                    {result.targetsImported ? `, ${result.targetsImported} targets` : ""}
                  </p>
                  {result.monthsImported && result.monthsImported.length > 0 && (
                    <p className="text-xs">Months: {result.monthsImported.join(", ")}</p>
                  )}
                  {result.totalSkipped && result.totalSkipped > 0 ? (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs font-medium">
                        {result.totalSkipped} row(s) skipped — click to see details
                      </summary>
                      <ul className="mt-1 max-h-32 overflow-y-auto text-xs space-y-0.5">
                        {(result.skipped ?? []).map((s, i) => (
                          <li key={i} className="opacity-80">{s}</li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {result && !result.error ? "Close" : "Cancel"}
          </Button>
          <Button onClick={handleUpload} disabled={!file || uploading}>
            {uploading ? "Importing…" : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
