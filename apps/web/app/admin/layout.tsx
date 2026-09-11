"use client";
import { usePathname } from "next/navigation";
import { AdminShell } from "@/components/layout/admin-shell";
export default function AdminLayout({ children }: { children: React.ReactNode }) { const pathname = usePathname(); return pathname === "/admin/login" ? children : <AdminShell>{children}</AdminShell>; }
