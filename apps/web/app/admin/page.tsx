"use client";

import Link from "next/link";
import { ArrowRight, CalendarDays, ExternalLink, MapPin, RefreshCw, Users } from "lucide-react";
import { useAdmin } from "@/components/layout/admin-shell";
import { useAdminResource } from "@/hooks/use-admin-resource";
import { Button } from "@/components/ui/button";
import { Alert, EmptyState, Spinner } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { CheckinChart } from "@/components/dashboard/checkin-chart";
import { formatDate, formatTime, number } from "@/lib/utils";
import type { DashboardSummary, TrendPoint } from "@/types";

export default function DashboardPage() {
  const { event, invalidate } = useAdmin();
  const summary = useAdminResource<DashboardSummary>("/admin/dashboard/summary");
  const trend = useAdminResource<TrendPoint[]>("/admin/dashboard/checkins");
  const data = summary.data;

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-bold tracking-[-.02em]">Tổng quan</h1>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={invalidate} disabled={summary.loading || trend.loading}><RefreshCw className={summary.loading ? "animate-spin" : ""}/>Làm mới</Button>
        <Button asChild><Link href="/admin/guests"><Users/>Khách mời</Link></Button>
      </div>
    </div>

    <section className="overflow-hidden rounded-lg border border-border bg-white">
      <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
        <div>
          <h2 className="text-sm font-bold text-foreground">{event.name}</h2>
          <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
            <span className="inline-flex items-center gap-1.5"><CalendarDays className="size-3.5"/>{formatDate(event.start_at, { hour: "2-digit", minute: "2-digit" })}</span>
            <span className="inline-flex items-center gap-1.5"><MapPin className="size-3.5"/>{event.venue}</span>
          </div>
        </div>
        <Button asChild variant="secondary" size="sm"><a href={event.welcome_screen_url} target="_blank" rel="noopener noreferrer">Màn hình chào<ExternalLink/></a></Button>
      </div>
      {data && <dl className="grid border-t border-border bg-slate-50/60 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Thư mời", data.total_guests, "Tổng danh sách"],
          ["Đã xác nhận", data.accepted, `${number(data.pending)} chờ phản hồi`],
          ["Dự kiến tham dự", data.expected_attendance, "Gồm người đi cùng"],
          ["Đã check-in", data.checked_in, `${number(data.checkin_rate)}% thư mời`],
        ].map(([label, value, detail], index) => <div key={label} className={`px-5 py-4 ${index > 0 ? "border-t border-border sm:border-t-0 sm:border-l" : ""} ${index === 2 ? "sm:border-l-0 sm:border-t xl:border-l xl:border-t-0" : ""}`}>
          <dt className="text-xs font-medium text-muted">{label}</dt>
          <dd className="mt-1 text-2xl font-bold tracking-tight text-foreground tabular-nums">{number(value as number)}</dd>
          <p className="mt-1 text-xs text-muted">{detail}</p>
        </div>)}
      </dl>}
    </section>

    {summary.error && <Alert>{summary.error} Dữ liệu trước đó, nếu có, được giữ lại để đối chiếu.</Alert>}
    {!data ? summary.loading ? <Spinner/> : <EmptyState title="Không tải được tổng quan"><Button onClick={() => void summary.refresh()}>Thử lại</Button></EmptyState> : <>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(280px,.75fr)]">
        <section className="overflow-hidden rounded-lg border border-border bg-white">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div><h2 className="text-base font-bold">Check-in gần nhất</h2><p className="mt-1 text-xs text-muted">Theo dõi khách vừa được đón tại các quầy</p></div>
            <Button asChild variant="ghost" size="sm"><Link href="/admin/guests">Xem danh sách<ArrowRight/></Link></Button>
          </div>
          {data.recent_checkins.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold text-slate-600"><tr><th className="px-5 py-3 font-semibold">Khách mời</th><th className="px-5 py-3 font-semibold">Đơn vị</th><th className="px-5 py-3 font-semibold">Quầy</th><th className="px-5 py-3 text-right font-semibold">Thời gian</th></tr></thead>
            <tbody>{data.recent_checkins.map((guest) => <tr key={guest.id} className="border-t border-border hover:bg-slate-50"><td className="whitespace-nowrap px-5 py-3 font-semibold text-foreground">{guest.guest_name}</td><td className="px-5 py-3 text-muted">{guest.company || "—"}</td><td className="px-5 py-3"><Badge>{guest.counter}</Badge></td><td className="whitespace-nowrap px-5 py-3 text-right text-muted tabular-nums">{formatTime(guest.checked_in_at)}</td></tr>)}</tbody>
          </table></div> : <EmptyState title="Chưa có lượt check-in" description="Danh sách sẽ cập nhật khi quầy xác nhận khách đầu tiên."/>}
        </section>

        <aside className="rounded-lg border border-border bg-white">
          <div className="border-b border-border px-5 py-4"><h2 className="text-base font-bold">Cần theo dõi</h2><p className="mt-1 text-xs text-muted">Các nhóm cần Ban tổ chức xử lý</p></div>
          <dl className="divide-y divide-border px-5">
            <div className="flex items-center justify-between py-4"><dt className="text-sm text-muted">Chờ phản hồi</dt><dd className="font-bold tabular-nums">{number(data.pending)}</dd></div>
            <div className="flex items-center justify-between py-4"><dt className="text-sm text-muted">Đã xác nhận, chưa đến</dt><dd className="font-bold text-amber-700 tabular-nums">{number(data.no_show)}</dd></div>
            <div className="flex items-center justify-between py-4"><dt className="text-sm text-muted">Không tham dự</dt><dd className="font-bold tabular-nums">{number(data.declined)}</dd></div>
          </dl>
          <div className="border-t border-border p-4"><Button asChild variant="secondary" className="w-full"><Link href="/admin/guests">Mở danh sách xử lý<ArrowRight/></Link></Button></div>
        </aside>
      </div>

      <section className="grid overflow-hidden rounded-lg border border-border bg-white xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,.7fr)]">
        <div className="p-5 xl:border-r xl:border-border">
          <h2 className="text-base font-bold">Nhịp check-in theo 15 phút</h2>
          <p className="mt-1 text-xs text-muted">Dùng để nhận biết thời điểm đông khách và điều phối quầy</p>
          {trend.error && <div className="mt-3"><Alert>{trend.error}</Alert></div>}
          {trend.data ? <CheckinChart points={trend.data}/> : trend.loading ? <Spinner/> : <p className="py-8 text-center text-sm text-muted">Chưa có dữ liệu.</p>}
        </div>
        <div className="border-t border-border p-5 xl:border-t-0">
          <h2 className="text-base font-bold">Lượt đón theo quầy</h2>
          <div className="mt-4 divide-y divide-border border-y border-border">{event.counters.map((counter) => <div key={counter} className="flex items-center justify-between py-3 text-sm"><span className="font-medium text-slate-700">{counter}</span><span className="font-bold tabular-nums">{number(data.checkins_by_counter.find((item) => item.counter === counter)?.count || 0)} <span className="font-normal text-muted">khách</span></span></div>)}</div>
        </div>
      </section>
    </>}
  </div>;
}
