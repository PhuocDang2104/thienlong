"use client";

import { useState } from "react";
import { Check, Download, FileSpreadsheet, FileText, LoaderCircle, QrCode } from "lucide-react";
import { useAdmin } from "@/components/layout/admin-shell";
import { download } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";

const exports = [
  { id: "xlsx", title: "Báo cáo Excel", detail: "Khách mời, phản hồi, người đi cùng và kết quả check-in.", path: "/admin/export/checkins.xlsx", filename: "bao-cao-check-in.xlsx", label: "Tải .xlsx", Icon: FileSpreadsheet },
  { id: "csv", title: "Dữ liệu CSV", detail: "Dữ liệu dạng bảng để đối chiếu hoặc xử lý trong công cụ khác.", path: "/admin/export/checkins.csv", filename: "bao-cao-check-in.csv", label: "Tải .csv", Icon: FileText },
  { id: "qr", title: "Bộ QR thư mời", detail: "QR từng khách kèm bảng đối chiếu tên, đường dẫn và tên tệp.", path: "/admin/guests/qr.zip", filename: "ma-qr-khach-moi.zip", label: "Tải .zip", Icon: QrCode },
];

export default function ExportPage() {
  const { token } = useAdmin();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState<string | null>(null);
  const run = async (item: typeof exports[number]) => {
    setBusy(item.id); setError(null); setCompleted(null);
    try { await download(item.path, item.filename, token); setCompleted(item.id); }
    catch (err) { setError(err instanceof Error ? err.message : "Không thể tải tệp."); }
    finally { setBusy(null); }
  };

  return <div className="space-y-5">
    <div><h1 className="text-2xl font-bold tracking-[-.02em]">Xuất dữ liệu</h1><p className="mt-1.5 text-sm text-muted">Tạo tệp phục vụ vận hành và bàn giao sau sự kiện.</p></div>
    {error && <Alert>{error}</Alert>}
    {completed && <Alert tone="success">Tệp đã được tạo. Kiểm tra thư mục tải xuống.</Alert>}
    <section className="overflow-hidden rounded-lg border border-border bg-white">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] border-b border-border bg-slate-50 px-5 py-3 text-xs font-semibold text-slate-600"><span>Loại dữ liệu</span><span>Thao tác</span></div>
      <div className="divide-y divide-border">{exports.map((item) => <div key={item.id} className="flex flex-wrap items-center gap-4 px-5 py-4 sm:flex-nowrap">
        <item.Icon className="size-5 shrink-0 text-primary"/>
        <div className="min-w-0 flex-1"><h2 className="text-sm font-bold">{item.title}</h2><p className="mt-1 text-xs leading-5 text-muted">{item.detail}</p></div>
        <Button variant={item.id === "xlsx" ? "primary" : "secondary"} className="ml-9 sm:ml-0 sm:min-w-28" onClick={() => void run(item)} disabled={!!busy}>{busy === item.id ? <LoaderCircle className="animate-spin"/> : completed === item.id ? <Check/> : <Download/>}{busy === item.id ? "Đang tạo…" : item.label}</Button>
      </div>)}</div>
      <p className="border-t border-border bg-slate-50 px-5 py-3 text-xs leading-5 text-muted">Báo cáo gồm toàn bộ khách, kể cả người chưa đến. QR chứa đường dẫn thư mời riêng của từng khách.</p>
    </section>
  </div>;
}
