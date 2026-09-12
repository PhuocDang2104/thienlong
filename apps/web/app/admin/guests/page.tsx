"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { SortingState } from "@tanstack/react-table";
import { ChevronLeft, ChevronRight, FileUp, RefreshCw, Search, Trash2, UserPlus, X } from "lucide-react";
import { useAdmin } from "@/components/layout/admin-shell";
import { useAdminResource } from "@/hooks/use-admin-resource";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Alert, Spinner } from "@/components/ui/feedback";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { GuestForm } from "@/components/guests/guest-form";
import { GuestTable, type GuestTableMode } from "@/components/guests/guest-table";
import { api } from "@/lib/api";
import { number } from "@/lib/utils";
import type { Guest, GuestPage } from "@/types";

export default function GuestsPage() {
  const { token, invalidate } = useAdmin();
  const [mode, setMode] = useState<GuestTableMode>("invitation");
  const [search, setSearch] = useState(""); const [debouncedSearch, setDebouncedSearch] = useState("");
  const [rsvp, setRsvp] = useState(""); const [checkin, setCheckin] = useState("");
  const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(20);
  const [sorting, setSorting] = useState<SortingState>([{ id: "created_at", desc: true }]);
  const [editing, setEditing] = useState<Guest | null>(null); const [creating, setCreating] = useState(false); const [success, setSuccess] = useState<string | null>(null);
  const [deletingGuest, setDeletingGuest] = useState<Guest | null>(null); const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState(""); const [deleteBusy, setDeleteBusy] = useState(false); const [deleteError, setDeleteError] = useState<string | null>(null);
  useEffect(() => { const timer = setTimeout(() => { setDebouncedSearch(search.trim()); setPage(1); }, 300); return () => clearTimeout(timer); }, [search]);
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize), sort: `${sorting[0]?.desc ? "-" : ""}${sorting[0]?.id || "created_at"}` });
  if (debouncedSearch) params.set("search", debouncedSearch);
  if (mode === "checkin") params.set("rsvp_status", "accepted"); else if (rsvp) params.set("rsvp_status", rsvp);
  if (mode === "checkin" && checkin) params.set("checkin_status", checkin);
  const resource = useAdminResource<GuestPage>(`/admin/guests?${params.toString()}`);
  const pages = Math.max(1, Math.ceil((resource.data?.total || 0) / pageSize));
  const filtered = !!(search || (mode === "invitation" ? rsvp : checkin));
  const selectMode = (next: GuestTableMode) => { setMode(next); setPage(1); setRsvp(""); setCheckin(""); setSorting([{ id: "created_at", desc: true }]); };
  const removeGuests = async (path: string, message: (deleted: number) => string) => {
    setDeleteBusy(true); setDeleteError(null); setSuccess(null);
    try {
      const result = await api<{ deleted: number }>(path, { method: "DELETE", token });
      setDeletingGuest(null); setDeleteAllOpen(false); setDeleteConfirmation(""); setPage(1); setSuccess(message(result.deleted)); invalidate();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Không thể xóa dữ liệu khách.");
    } finally { setDeleteBusy(false); }
  };

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-bold tracking-[-.02em]">Khách mời</h1><div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => void resource.refresh()} disabled={resource.loading}><RefreshCw className={resource.loading ? "animate-spin" : ""}/>Làm mới</Button><Button variant="secondary" asChild><Link href="/admin/import"><FileUp/>Nhập file</Link></Button><Button variant="secondary" className="border-red-200 text-red-700 hover:border-red-300 hover:bg-red-50" onClick={() => { setDeleteError(null); setDeleteConfirmation(""); setDeleteAllOpen(true); }}><Trash2/>Xóa tất cả</Button><Button onClick={() => { setSuccess(null); setCreating(true); }}><UserPlus/>Thêm khách</Button></div></div>
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
      {!resource.data && resource.loading ? <Spinner/> : <GuestTable mode={mode} guests={resource.data?.items || []} sorting={sorting} onSortingChange={(value) => { setSorting(value); setPage(1); }} onEdit={setEditing} onDelete={(guest) => { setDeleteError(null); setDeletingGuest(guest); }}/>}
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border bg-white px-5 py-4 text-xs text-muted"><span aria-live="polite">{resource.loading ? "Đang cập nhật…" : resource.data?.total ? `${number((page - 1) * pageSize + 1)}–${number(Math.min(page * pageSize, resource.data.total))} / ${number(resource.data.total)} khách` : "0 khách"}</span><div className="flex items-center gap-4"><label className="flex items-center gap-2"><span className="hidden sm:inline">Mỗi trang</span><Select className="h-8 text-xs" aria-label="Số khách mỗi trang" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}><option value={20}>20</option><option value={50}>50</option><option value={100}>100</option></Select></label><span>{page} / {pages}</span><div className="flex gap-1"><Button variant="secondary" size="icon" aria-label="Trang trước" disabled={page <= 1 || resource.loading} onClick={() => setPage((value) => value - 1)}><ChevronLeft/></Button><Button variant="secondary" size="icon" aria-label="Trang sau" disabled={page >= pages || resource.loading} onClick={() => setPage((value) => value + 1)}><ChevronRight/></Button></div></div></div>
    </div>
    <Dialog open={!!editing} onOpenChange={(open) => { if (!open) setEditing(null); }}><DialogContent><DialogTitle className="pr-6 text-xl font-bold">Chỉnh sửa khách mời</DialogTitle><DialogDescription className="mt-2 text-sm text-muted">Thông tin thư mời và phản hồi tham dự.</DialogDescription>{editing && <GuestForm key={editing.id} guest={editing} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); setSuccess("Đã lưu thông tin khách mời."); invalidate(); }}/>}</DialogContent></Dialog>
    <Dialog open={creating} onOpenChange={setCreating}><DialogContent><DialogTitle className="pr-6 text-xl font-bold">Thêm khách mời</DialogTitle><DialogDescription className="mt-2 text-sm leading-5 text-muted">Link thư mời và QR được tạo tự động.</DialogDescription>{creating && <GuestForm onCancel={() => setCreating(false)} onSaved={() => { setCreating(false); setPage(1); setSuccess("Đã thêm khách và tạo link/QR riêng."); invalidate(); }}/>}</DialogContent></Dialog>
    <Dialog open={!!deletingGuest} onOpenChange={(open) => { if (!open && !deleteBusy) { setDeletingGuest(null); setDeleteError(null); } }}><DialogContent><DialogTitle className="pr-6 text-xl font-bold">Xóa khách mời?</DialogTitle><DialogDescription className="mt-2 text-sm leading-6 text-muted">Thư mời, token QR và lượt check-in của <strong className="text-foreground">{deletingGuest?.name}</strong> sẽ bị xóa. Thao tác này không thể hoàn tác.</DialogDescription>{deleteError && <div className="mt-4"><Alert>{deleteError}</Alert></div>}<div className="mt-6 flex justify-end gap-2"><Button variant="secondary" disabled={deleteBusy} onClick={() => setDeletingGuest(null)}>Hủy</Button><Button variant="danger" disabled={deleteBusy || !deletingGuest} onClick={() => deletingGuest && void removeGuests(`/admin/guests/${deletingGuest.id}`, () => `Đã xóa ${deletingGuest.name}.`)}>{deleteBusy ? "Đang xóa…" : "Xóa khách"}</Button></div></DialogContent></Dialog>
    <Dialog open={deleteAllOpen} onOpenChange={(open) => { if (!open && !deleteBusy) { setDeleteAllOpen(false); setDeleteConfirmation(""); setDeleteError(null); } }}><DialogContent><DialogTitle className="pr-6 text-xl font-bold">Xóa toàn bộ danh sách?</DialogTitle><DialogDescription className="mt-2 text-sm leading-6 text-muted">Toàn bộ khách, token QR, phản hồi và lượt check-in sẽ bị xóa. Sau đó bạn có thể nhập CSV mới.</DialogDescription><div className="mt-5"><label htmlFor="delete-all-confirmation" className="mb-2 block text-sm font-semibold text-foreground">Nhập <span className="font-bold text-red-700">XOA TAT CA</span> để xác nhận</label><Input id="delete-all-confirmation" autoComplete="off" value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} placeholder="XOA TAT CA" disabled={deleteBusy}/></div>{deleteError && <div className="mt-4"><Alert>{deleteError}</Alert></div>}<div className="mt-6 flex justify-end gap-2"><Button variant="secondary" disabled={deleteBusy} onClick={() => setDeleteAllOpen(false)}>Hủy</Button><Button variant="danger" disabled={deleteBusy || deleteConfirmation.trim().toUpperCase() !== "XOA TAT CA"} onClick={() => void removeGuests("/admin/guests", (deleted) => `Đã xóa ${number(deleted)} khách. Có thể nhập CSV mới.`)}>{deleteBusy ? "Đang xóa…" : "Xóa toàn bộ"}</Button></div></DialogContent></Dialog>
  </div>;
}
