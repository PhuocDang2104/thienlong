"use client";
import { useState } from "react";
import { Check, Download, FileSpreadsheet, FileText, LoaderCircle, QrCode } from "lucide-react";
import { useAdmin } from "@/components/layout/admin-shell";
import { download } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";

const exports = [
  { id: "xlsx", title: "Báo cáo Excel", detail: "Danh sách đầy đủ khách mời, phản hồi tham dự, người đi cùng và kết quả check-in.", path: "/admin/export/checkins.xlsx", filename: "bao-cao-check-in.xlsx", label: "Tải báo cáo .xlsx", Icon: FileSpreadsheet },
  { id: "csv", title: "Dữ liệu CSV", detail: "Dữ liệu khách mời và check-in dạng bảng để đối chiếu hoặc xử lý trong công cụ khác.", path: "/admin/export/checkins.csv", filename: "bao-cao-check-in.csv", label: "Tải dữ liệu .csv", Icon: FileText },
  { id: "qr", title: "Bộ mã QR thư mời", detail: "Tệp ZIP chứa QR riêng cho từng khách và bảng đối chiếu tên, đường dẫn thư mời, tên tệp QR.", path: "/admin/guests/qr.zip", filename: "ma-qr-khach-moi.zip", label: "Tải bộ QR .zip", Icon: QrCode },
];
export default function ExportPage() {
  const { token } = useAdmin(); const [busy, setBusy] = useState<string | null>(null); const [error, setError] = useState<string | null>(null); const [completed, setCompleted] = useState<string | null>(null);
  const run = async (item: typeof exports[number]) => { setBusy(item.id); setError(null); setCompleted(null); try { await download(item.path, item.filename, token); setCompleted(item.id); } catch (err) { setError(err instanceof Error ? err.message : "Không thể tải tệp."); } finally { setBusy(null); } };
  return <div className="space-y-6"><div><p className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-primary"><span className="h-0.5 w-7 bg-brand-red"/>Bàn giao dữ liệu</p><h1 className="text-3xl font-bold tracking-[-.035em]">Xuất báo cáo</h1></div>{error && <Alert>{error}</Alert>}{completed && <Alert tone="success">Tệp đã được tạo. Kiểm tra thư mục tải xuống.</Alert>}
    <div className="grid gap-5 xl:grid-cols-3">{exports.map((item,index) => <section key={item.id} className="card-shell card-interactive relative flex flex-col overflow-hidden rounded-2xl p-6"><span className={`absolute inset-x-0 top-0 h-1 ${index === 1 ? "bg-brand-red" : "bg-primary"}`}/><span className="mb-7 flex size-12 items-center justify-center rounded-xl bg-blue-50 text-primary shadow-inner"><item.Icon className="size-6"/></span><h2 className="text-lg font-bold">{item.title}</h2><p className="mt-3 mb-7 flex-1 text-sm leading-6 text-muted">{item.detail}</p><Button variant={item.id === "xlsx" ? "primary" : "secondary"} onClick={() => void run(item)} disabled={!!busy}>{busy === item.id ? <LoaderCircle className="animate-spin"/> : completed === item.id ? <Check/> : <Download/>}{busy === item.id ? "Đang tạo tệp…" : item.label}</Button></section>)}</div>
    <section className="card-shell rounded-2xl p-6"><h2 className="text-base font-bold">Nội dung báo cáo</h2><div className="mt-5 grid gap-6 text-sm sm:grid-cols-2"><div><h3 className="text-sm font-semibold text-primary">Thông tin khách mời</h3><p className="mt-2 text-xs leading-6 text-muted">Họ tên, liên hệ, đơn vị, RSVP và người đi cùng.</p></div><div><h3 className="text-sm font-semibold text-primary">Kết quả đón tiếp</h3><p className="mt-2 text-xs leading-6 text-muted">Trạng thái, thời gian và quầy check-in.</p></div></div><div className="mt-6 border-t border-border pt-4 text-xs leading-6 text-muted">Báo cáo luôn bao gồm toàn bộ khách, kể cả người chưa đến.</div></section>
  </div>;
}
