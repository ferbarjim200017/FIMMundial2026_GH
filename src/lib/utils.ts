import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { CURRENCY, LOCALE } from "@/lib/constants";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency: CURRENCY,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPercent(value: number, digits = 1): string {
  return new Intl.NumberFormat(LOCALE, {
    style: "percent",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value / 100);
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat(LOCALE, {
    dateStyle: "medium",
  }).format(date);
}

export function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat(LOCALE, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function profitClass(value: number): string {
  if (value > 0) return "text-profit";
  if (value < 0) return "text-loss";
  return "text-muted-foreground";
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
