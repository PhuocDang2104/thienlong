import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
export function formatDate(value: string | null | undefined, options?: Intl.DateTimeFormatOptions) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric", ...options }).format(date);
}
export function formatTime(value: string | null | undefined) { return formatDate(value, { day: undefined, month: undefined, year: undefined, hour: "2-digit", minute: "2-digit", second: "2-digit" }); }
export function number(value: number) { return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(value); }
