"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ExportButtonProps {
  /** Base URL for the export API, e.g. "/api/export/transactions" */
  baseUrl: string;
  /** Additional query params, e.g. { month: "2026-01" } */
  params?: Record<string, string>;
  /** Button label */
  label?: string;
  /** Which formats to show */
  formats?: ("csv" | "xlsx")[];
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
}

export function ExportButton({
  baseUrl,
  params = {},
  label = "Export",
  formats = ["csv", "xlsx"],
  variant = "outline",
  size = "sm",
  className,
}: ExportButtonProps) {
  const [loading, setLoading] = useState<string | null>(null);

  function buildUrl(fmt: string) {
    const url = new URL(baseUrl, window.location.origin);
    url.searchParams.set("format", fmt);
    for (const [k, v] of Object.entries(params)) {
      if (v) url.searchParams.set(k, v);
    }
    return url.toString();
  }

  async function handleExport(fmt: string) {
    setLoading(fmt);
    try {
      const res = await fetch(buildUrl(fmt));
      if (!res.ok) throw new Error(`Export failed: ${res.statusText}`);
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const fnMatch = disposition.match(/filename="?([^";]+)"?/);
      const filename = fnMatch ? fnMatch[1] : `export.${fmt}`;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Export failed");
    } finally {
      setLoading(null);
    }
  }

  if (formats.length === 1) {
    return (
      <Button
        variant={variant}
        size={size}
        className={className}
        disabled={!!loading}
        onClick={() => handleExport(formats[0])}
      >
        {loading ? "Exporting…" : `${label} ${formats[0].toUpperCase()}`}
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size={size} className={className} disabled={!!loading}>
          {loading ? "Exporting…" : label}
          <svg className="ml-1 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {formats.map((fmt) => (
          <DropdownMenuItem key={fmt} onClick={() => handleExport(fmt)}>
            Export as {fmt.toUpperCase()}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
