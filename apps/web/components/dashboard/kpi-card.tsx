import type { LucideIcon } from "lucide-react";
import { number } from "@/lib/utils";
export function KpiCard({ label, value, description, icon: Icon }: { label: string; value: number; description: string; icon: LucideIcon }) {
  return <div className="card-shell card-interactive relative overflow-hidden rounded-2xl p-5"><span className="absolute inset-y-0 left-0 w-1 bg-primary"/><div className="mb-5 flex items-center justify-between gap-2"><h2 className="text-sm font-semibold text-slate-700">{label}</h2><span className="flex size-9 items-center justify-center rounded-xl bg-blue-50 text-primary shadow-inner"><Icon className="size-[18px]"/></span></div><p className="text-[34px] leading-none font-bold tracking-[-.04em] text-foreground tabular-nums">{number(value)}</p><p className="mt-3 text-xs leading-5 text-muted">{description}</p></div>;
}
