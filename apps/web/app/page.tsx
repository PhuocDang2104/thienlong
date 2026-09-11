import Link from "next/link";
import { ArrowRight, ChartNoAxesCombined, CheckCircle2, Radio, ScanLine, ShieldCheck } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";

const portals = [
  { href: "/admin", title: "Ban tổ chức", description: "Quản lý khách mời và theo dõi tiến độ đón tiếp.", Icon: ChartNoAxesCombined, label: "Trang quản trị" },
  { href: "/pg", title: "Quầy check-in", description: "Quét QR, tìm khách và xác nhận khách đến.", Icon: ScanLine, label: "Dành cho PG" },
];

export default function Home() {
  return <main className="brand-page relative min-h-dvh overflow-hidden bg-white">
    <div aria-hidden className="absolute inset-y-0 left-0 hidden w-[38%] bg-[#0d2d6c] lg:block" />
    <div aria-hidden className="absolute left-[38%] top-0 hidden h-full w-1 bg-brand-red lg:block" />
    <div className="relative mx-auto flex min-h-dvh max-w-7xl flex-col px-5 py-6 sm:px-8 lg:px-12 lg:py-9">
      <header className="flex items-center justify-between">
        <div className="rounded-xl bg-white px-4 py-2 shadow-[0_8px_30px_rgba(5,24,64,.16)]"><BrandLogo priority className="w-40 sm:w-48" /></div>
        <span className="rounded-full border border-blue-100 bg-white/90 px-4 py-2 text-[10px] font-bold uppercase tracking-[.16em] text-primary shadow-sm sm:text-xs">Event Check-in</span>
      </header>
      <div className="grid flex-1 items-center gap-12 py-12 lg:grid-cols-[.8fr_1.2fr] lg:gap-20 lg:py-16">
        <section className="text-foreground lg:pr-4 lg:text-white">
          <div className="mb-6 flex items-center gap-3"><span className="h-0.5 w-9 bg-brand-red"/><p className="text-xs font-bold uppercase tracking-[.2em] text-primary lg:text-blue-200">Vận hành sự kiện</p></div>
          <h1 className="max-w-xl text-[clamp(2.5rem,5vw,4.8rem)] font-semibold leading-[1.04] tracking-[-.045em]">Đón khách<br/>nhanh và chính xác.</h1>
          <p className="mt-6 max-w-md text-base leading-7 text-muted lg:text-blue-100/75">Một hệ thống cho RSVP, quét QR, theo dõi realtime và xuất báo cáo.</p>
          <div className="mt-9 flex flex-wrap gap-x-6 gap-y-3 text-xs font-medium text-slate-600 lg:text-blue-100/80">
            <span className="inline-flex items-center gap-2"><CheckCircle2 className="size-4 text-brand-red"/>Dữ liệu đồng bộ</span>
            <span className="inline-flex items-center gap-2"><Radio className="size-4 text-brand-red"/>Cập nhật trực tiếp</span>
            <span className="inline-flex items-center gap-2"><ShieldCheck className="size-4 text-brand-red"/>Chống check-in trùng</span>
          </div>
        </section>
        <section className="grid gap-5 sm:grid-cols-2">
          {portals.map(({ href, title, description, Icon, label }, index) => <Link key={href} href={href} className="card-shell card-interactive group relative overflow-hidden rounded-2xl p-7 sm:p-8">
            <span className={`absolute inset-x-0 top-0 h-1 ${index === 0 ? "bg-primary" : "bg-brand-red"}`} />
            <div className="mb-12 flex items-start justify-between"><span className="flex size-12 items-center justify-center rounded-xl bg-blue-50 text-primary shadow-inner"><Icon className="size-6"/></span><span className="text-[10px] font-bold uppercase tracking-[.15em] text-muted">{label}</span></div>
            <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
            <p className="mt-3 min-h-12 text-sm leading-6 text-muted">{description}</p>
            <div className="mt-8 flex items-center justify-between border-t border-border pt-5 text-sm font-semibold text-primary"><span>Truy cập</span><span className="flex size-9 items-center justify-center rounded-full bg-blue-50 transition group-hover:bg-primary group-hover:text-white"><ArrowRight className="size-4"/></span></div>
          </Link>)}
        </section>
      </div>
      <footer className="flex items-center justify-between border-t border-slate-200/80 pt-5 text-[10px] font-semibold uppercase tracking-[.14em] text-muted lg:border-white/15 lg:text-blue-100/55"><span>Thiên Long Event Operations</span><span>Realtime · Secure · Reliable</span></footer>
    </div>
  </main>;
}
