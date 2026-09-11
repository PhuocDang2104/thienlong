"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { ChartNoAxesCombined, Download, ExternalLink, FileUp, LogOut, Menu, RefreshCw, Users, X } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { api, ApiError } from "@/lib/api";
import { clearSession, getSession, type Session } from "@/lib/session";
import { cn } from "@/lib/utils";
import { useEventStream, type StreamStatus } from "@/hooks/use-event-stream";
import { Button } from "@/components/ui/button";
import { Alert, Spinner } from "@/components/ui/feedback";
import { BrandLogo } from "@/components/brand-logo";
import type { EventInfo } from "@/types";

type AdminContextValue = { token: string; event: EventInfo; version: number; invalidate: () => void; streamStatus: StreamStatus };
const AdminContext = createContext<AdminContextValue | null>(null);
export function useAdmin() { const context = useContext(AdminContext); if (!context) throw new Error("Admin provider is required"); return context; }
const navigation = [{ href: "/admin", label: "Tổng quan", Icon: ChartNoAxesCombined }, { href: "/admin/guests", label: "Khách mời", Icon: Users }, { href: "/admin/import", label: "Nhập danh sách", Icon: FileUp }, { href: "/admin/export", label: "Xuất dữ liệu", Icon: Download }];

function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return <>
    <Link href="/" className="mb-11 block rounded-xl border border-blue-100 bg-white px-3 py-2.5 shadow-[0_10px_28px_rgba(13,45,108,.12)]"><BrandLogo priority className="w-full"/></Link>
    <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-[#486394]">Quản trị sự kiện</p>
    <nav aria-label="Điều hướng quản trị" className="space-y-1.5">{navigation.map(({ href, label, Icon }) => <Link key={href} href={href} onClick={onNavigate} aria-current={pathname === href ? "page" : undefined} className={cn("relative flex items-center gap-3 overflow-hidden rounded-xl px-3.5 py-3 text-sm font-bold text-[#173a7a] transition-[background-color,color,transform,box-shadow]", pathname === href ? "bg-blue-50 text-[#123b88] shadow-[0_8px_22px_rgba(36,74,165,.13)] before:absolute before:inset-y-2 before:left-0 before:w-1 before:rounded-r before:bg-brand-red" : "hover:translate-x-0.5 hover:bg-blue-50/70 hover:text-primary")}><Icon className="size-[18px]"/>{label}</Link>)}</nav>
    <div className="mt-auto border-t border-slate-200 pt-5"><a href="/pg" target="_blank" rel="noopener noreferrer" className="flex items-center justify-between rounded-xl px-3 py-3 text-xs font-bold text-[#365687] transition hover:bg-blue-50 hover:text-primary">Mở quầy đón tiếp<ExternalLink className="size-3.5"/></a><p className="mt-5 px-3 text-[10px] font-semibold uppercase tracking-[.12em] text-slate-400">Event operations · v1.0</p></div>
  </>;
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter(); const pathname = usePathname();
  const [auth, setAuth] = useState<{ session: Session; email: string; event: EventInfo } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authAttempt, setAuthAttempt] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [version, setVersion] = useState(0);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const boot = async () => {
      const session = getSession("admin");
      if (!session) { router.replace("/admin/login"); return; }
      try {
        const [me, event] = await Promise.all([api<{ email: string }>("/admin/me", { token: session.access_token, signal: controller.signal }), api<EventInfo>("/admin/event", { token: session.access_token, signal: controller.signal })]);
        if (!controller.signal.aborted) { setAuth({ session, email: me.email, event }); setError(null); }
      } catch (err) { if (controller.signal.aborted) return; if (err instanceof ApiError && err.status === 401) { clearSession("admin"); router.replace("/admin/login"); } else setError(err instanceof Error ? err.message : "Không thể tải thông tin phiên làm việc."); }
    };
    void boot(); return () => controller.abort();
  }, [router, authAttempt]);
  useEffect(() => {
    if (!auth) return;
    const logout = () => { clearSession("admin"); setAuth(null); router.replace("/admin/login?expired=1"); };
    const unauthorized = (event: Event) => { if ((event as CustomEvent).detail === auth.session.access_token) logout(); };
    const timer = setTimeout(logout, Math.max(0, auth.session.expires_at - Date.now()));
    window.addEventListener("thienlong:unauthorized", unauthorized);
    return () => { clearTimeout(timer); window.removeEventListener("thienlong:unauthorized", unauthorized); };
  }, [auth, router]);
  useEffect(() => () => { if (debounce.current) clearTimeout(debounce.current); }, []);
  const stream = useEventStream({ path: "/admin/stream", token: auth?.session.access_token, enabled: !!auth, onEvent: (event) => {
    if (["ready", "checkin", "rsvp", "guests_changed"].includes(event.type)) {
      if (debounce.current) clearTimeout(debounce.current);
      debounce.current = setTimeout(() => setVersion((value) => value + 1), 250);
    }
  } });
  if (!auth) return <main className="flex min-h-dvh items-center justify-center p-6"><div className="w-full max-w-md">{error ? <><Alert>{error}</Alert><Button className="mt-4" onClick={() => setAuthAttempt((value) => value + 1)}>Thử lại</Button></> : <Spinner label="Đang kiểm tra phiên làm việc…"/>}</div></main>;
  const activeTitle = navigation.find((item) => item.href === pathname)?.label || "Ban tổ chức";
  return <AdminContext.Provider value={{ token: auth.session.access_token, event: auth.event, version, invalidate: () => setVersion((value) => value + 1), streamStatus: stream.status }}>
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-blue-100/80 bg-white px-5 py-7 shadow-[8px_0_30px_rgba(10,37,86,.08)] lg:flex"><Navigation/></aside>
    <div className="brand-page min-h-dvh lg:pl-64">
      <header className="sticky top-0 z-20 flex min-h-18 flex-wrap items-center justify-between gap-3 border-b border-white/80 bg-white/90 px-5 py-4 shadow-[0_4px_20px_rgba(16,37,80,.05)] backdrop-blur-xl md:px-8">
        <div className="flex items-center gap-3"><Dialog.Root open={drawerOpen} onOpenChange={setDrawerOpen}><Dialog.Trigger asChild><Button variant="ghost" size="icon" className="lg:hidden" aria-label="Mở menu"><Menu/></Button></Dialog.Trigger><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-40 bg-[#07183c]/60 backdrop-blur-sm"/><Dialog.Content className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-blue-100 bg-white px-5 py-7 shadow-2xl"><Dialog.Title className="sr-only">Điều hướng quản trị</Dialog.Title><Dialog.Description className="sr-only">Các khu vực vận hành sự kiện</Dialog.Description><Dialog.Close aria-label="Đóng menu" className="absolute top-3 right-3 rounded-lg p-2 text-[#173a7a] hover:bg-blue-50 hover:text-primary"><X className="size-4"/></Dialog.Close><Navigation onNavigate={() => setDrawerOpen(false)}/></Dialog.Content></Dialog.Portal></Dialog.Root><span className="text-sm font-bold text-foreground">{activeTitle}</span><span className="hidden text-slate-300 md:inline">/</span><span className="hidden max-w-72 truncate text-xs text-muted md:inline">{auth.event.name}</span></div>
        <Button variant="ghost" size="icon" title="Đăng xuất" aria-label="Đăng xuất" onClick={() => { clearSession("admin"); router.replace("/admin/login"); }}><LogOut/></Button>
      </header>
      <main className="page-enter mx-auto max-w-[1600px] p-5 md:p-8 lg:p-9">
        {stream.error && <div className="mb-5"><Alert tone="info"><span>{stream.error}</span><button className="ml-3 inline-flex items-center gap-1 font-medium underline" onClick={() => { stream.reconnect(); setVersion((value) => value + 1); }}><RefreshCw className="size-3"/>Kết nối lại & làm mới</button></Alert></div>}
        {children}
      </main>
    </div>
  </AdminContext.Provider>;
}
