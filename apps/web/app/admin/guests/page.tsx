"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { SortingState } from "@tanstack/react-table";
import { ChevronLeft, ChevronRight, FileUp, RefreshCw, Search, UserPlus, X } from "lucide-react";
import { useAdmin } from "@/components/layout/admin-shell";
import { useAdminResource } from "@/hooks/use-admin-resource";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Alert, Spinner } from "@/components/ui/feedback";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { GuestForm } from "@/components/guests/guest-form";
import { GuestTable, type GuestTableMode } from "@/components/guests/guest-table";
import { number } from "@/lib/utils";
import type { Guest, GuestPage } from "@/types";

export default function GuestsPage() {
  const { invalidate } = useAdmin();
  const [mode, setMode] = useState<GuestTableMode>("invitation");
  const [search, setSearch] = useState(""); const [debouncedSearch, setDebouncedSearch] = useState("");
  const [rsvp, setRsvp] = useState(""); const [checkin, setCheckin] = useState("");
  const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(20);
  const [sorting, setSorting] = useState<SortingState>([{ id: "created_at", desc: true }]);
  const [editing, setEditing] = useState<Guest | null>(null); const [creating, setCreating] = useState(false); const [success, setSuccess] = useState<string | null>(null);
  useEffect(() => { const timer = setTimeout(() => { setDebouncedSearch(search.trim()); setPage(1); }, 300); return () => clearTimeout(timer); }, [search]);
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize), sort: `${sorting[0]?.desc ? "-" : ""}${sorting[0]?.id || "created_at"}` });
  if (debouncedSearch) params.set("search", debouncedSearch);
  if (mode === "checkin") params.set("rsvp_status", "accepted"); else if (rsvp) params.set("rsvp_status", rsvp);
  if (mode === "checkin" && checkin) params.set("checkin_status", checkin);
  const resource = useAdminResource<GuestPage>(`/admin/guests?${params.toString()}`);
  const pages = Math.max(1, Math.ceil((resource.data?.total || 0) / pageSize));
  const filtered = !!(search || (mode === "invitation" ? rsvp : checkin));
  const selectMode = (next: GuestTableMode) => { setMode(next); setPage(1); setRsvp(""); setCheckin(""); setSorting([{ id: "created_at", desc: true }]); };

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-bold tracking-[-.02em]">Khách mời</h1><div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => void resource.refresh()} disabled={resource.loading}><RefreshCw className={resource.loading ? "animate-spin" : ""}/>Làm mới</Button><Button variant="secondary" asChild><Link href="/admin/import"><FileUp/>Nhập file</Link></Button><Button onClick={() => { setSuccess(null); setCreating(true); }}><UserPlus/>Thêm khách</Button></div></div>
    {success && <Alert tone="success">{success}</Alert>}{resource.error && <Alert>{resource.error}</Alert>}
    <div className="overflow-hidden rounded-lg border border-border bg-white">
      <div className="border-b border-border bg-white px-4 sm:px-5">
        <div role="tablist" aria-label="Chế độ danh sách khách" className="flex gap-6 border-b border-border">
          <button role="tab" aria-selected={mode === "invitation"} onClick={() => selectMode("invitation")} className={`min-h-12 border-b-2 px-0 text-sm font-semibold transition-colors ${mode === "invitation" ? "border-primary text-primary" : "border-transparent text-muted hover:text-foreground"}`}>Thư mời</button>
          <button role="tab" aria-selected={mode === "checkin"} onClick={() => selectMode("checkin")} className={`min-h-12 border-b-2 px-0 text-sm font-semibold transition-colors ${mode === "checkin" ? "border-primary text-primary" : "border-transparent text-muted hover:text-foreground"}`}>Danh sách check-in</button>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border/70 py-4"><div className="relative min-w-52 flex-1 md:max-w-sm"><label htmlFor="guest-search" className="sr-only">Tìm khách mời</label><Search className="absolute top-3 left-3 size-4 text-slate-400"/><Input id="guest-search" placeholder="Tên, công ty, email, điện thoại…" value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9"/></div>
          {mode === "invitation" ? <Select aria-label="Lọc phản hồi" value={rsvp} onChange={(event) => { setRsvp(event.target.value); setPage(1); }}><option value="">Tất cả phản hồi</option><option value="accepted">Đã xác nhận</option><option value="pending">Chưa phản hồi</option><option value="declined">Từ chối</option></Select> : <Select aria-label="Lọc check-in" value={checkin} onChange={(event) => { setCheckin(event.target.value); setPage(1); }}><option value="">Tất cả khách xác nhận</option><option value="not_checked_in">Chưa đến</option><option value="checked_in">Đã check-in</option></Select>}
          {filtered && <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setDebouncedSearch(""); setRsvp(""); setCheckin(""); setPage(1); }}><X/>Xóa lọc</Button>}
        </div>
      </div>
      {!resource.data && resource.loading ? <Spinner/> : <GuestTable mode={mode} guests={resource.data?.items || []} sorting={sorting} onSortingChange={(value) => { setSorting(value); setPage(1); }} onEdit={setEditing}/>} 
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border bg-white px-5 py-4 text-xs text-muted"><span aria-live="polite">{resource.loading ? "Đang cập nhật…" : resource.data?.total ? `${number((page - 1) * pageSize + 1)}–${number(Math.min(page * pageSize, resource.data.total))} / ${number(resource.data.total)} khách` : "0 khách"}</span><div className="flex items-center gap-4"><label className="flex items-center gap-2"><span className="hidden sm:inline">Mỗi trang</span><Select className="h-8 text-xs" aria-label="Số khách mỗi trang" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}><option value={20}>20</option><option value={50}>50</option><option value={100}>100</option></Select></label><span>{page} / {pages}</span><div className="flex gap-1"><Button variant="secondary" size="icon" aria-label="Trang trước" disabled={page <= 1 || resource.loading} onClick={() => setPage((value) => value - 1)}><ChevronLeft/></Button><Button variant="secondary" size="icon" aria-label="Trang sau" disabled={page >= pages || resource.loading} onClick={() => setPage((value) => value + 1)}><ChevronRight/></Button></div></div></div>
    </div>
    <Dialog open={!!editing} onOpenChange={(open) => { if (!open) setEditing(null); }}><DialogContent><DialogTitle className="pr-6 text-xl font-bold">Chỉnh sửa khách mời</DialogTitle><DialogDescription className="mt-2 text-sm text-muted">Thông tin thư mời và phản hồi tham dự.</DialogDescription>{editing && <GuestForm key={editing.id} guest={editing} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); setSuccess("Đã lưu thông tin khách mời."); invalidate(); }}/>}</DialogContent></Dialog>
    <Dialog open={creating} onOpenChange={setCreating}><DialogContent><DialogTitle className="pr-6 text-xl font-bold">Thêm khách mời</DialogTitle><DialogDescription className="mt-2 text-sm leading-5 text-muted">Link thư mời và QR được tạo tự động.</DialogDescription>{creating && <GuestForm onCancel={() => setCreating(false)} onSaved={() => { setCreating(false); setPage(1); setSuccess("Đã thêm khách và tạo link/QR riêng."); invalidate(); }}/>}</DialogContent></Dialog>
  </div>;
}
