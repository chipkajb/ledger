import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { getISOWeek, getISOWeekYear, format, parseISO } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(n: number | null | undefined): string {
  if (n == null) return "—";
  const abs = Math.abs(n);
  const formatted = abs.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return n < 0 ? `($${formatted})` : `$${formatted}`;
}

export function formatPercent(n: number | null | undefined, decimals = 1): string {
  if (n == null) return "—";
  return `${n.toFixed(decimals)}%`;
}

export function isoToMonthLabel(yyyyMM: string): string {
  // '2026-01' → 'January 2026'
  const [year, month] = yyyyMM.split("-").map(Number);
  const d = new Date(year, month - 1, 1);
  return format(d, "MMMM yyyy");
}

export function getWeekLabel(dateStr: string): string {
  // 'YYYY-WXX' using ISO week
  const d = parseISO(dateStr);
  const week = getISOWeek(d);
  const year = getISOWeekYear(d);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

export function currentMonth(): string {
  return format(new Date(), "yyyy-MM");
}

export function currentDate(): string {
  return format(new Date(), "yyyy-MM-dd");
}

export function monthsInYear(year: number): string[] {
  return Array.from({ length: 12 }, (_, i) =>
    `${year}-${String(i + 1).padStart(2, "0")}`
  );
}

export function parseMonthFromDate(dateStr: string): string {
  return dateStr.slice(0, 7); // 'YYYY-MM-DD' → 'YYYY-MM'
}
