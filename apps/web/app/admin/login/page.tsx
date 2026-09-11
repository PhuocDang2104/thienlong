"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, ArrowRight, CheckCircle2, LoaderCircle, Radio, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { saveSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/feedback";
import { BrandLogo } from "@/components/brand-logo";

const schema = z.object({ email: z.email("Nhập địa chỉ email hợp lệ."), password: z.string().min(1, "Nhập mật khẩu.") });
type Values = z.infer<typeof schema>;
const demoCredentials = {
  email: process.env.NEXT_PUBLIC_DEMO_ADMIN_EMAIL || "",
  password: process.env.NEXT_PUBLIC_DEMO_ADMIN_PASSWORD || "",
};
export default function LoginPage() {
  const router = useRouter(); const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: demoCredentials });
  const submit = async (values: Values) => { setError(null); try { const response = await api<{ access_token: string; expires_in: number }>("/admin/login", { method: "POST", body: values }); saveSession("admin", response); router.replace("/admin"); } catch (err) { setError(err instanceof Error ? err.message : "Đăng nhập không thành công."); } };
  return <main className="grid min-h-dvh bg-white lg:grid-cols-[1.05fr_.95fr]">
    <section className="relative hidden overflow-hidden bg-[#0d2d6c] p-12 text-white lg:flex lg:flex-col xl:p-16">
      <div aria-hidden className="absolute -right-24 -top-24 size-96 rounded-full border-[70px] border-white/[.035]"/>
      <div aria-hidden className="absolute bottom-0 left-0 h-1.5 w-full bg-brand-red"/>
      <div className="relative w-fit rounded-xl bg-white px-4 py-2 shadow-[0_14px_40px_rgba(0,0,0,.18)]"><BrandLogo priority className="w-48"/></div>
      <div className="relative my-auto max-w-xl">
        <p className="mb-5 text-xs font-bold uppercase tracking-[.2em] text-blue-200">Event Operations</p>
        <h1 className="text-5xl font-semibold leading-[1.08] tracking-[-.04em] xl:text-6xl">Kiểm soát toàn bộ<br/>hoạt động đón tiếp.</h1>
        <div className="mt-10 grid gap-4 text-sm text-blue-100/80 sm:grid-cols-3">
          <span className="flex items-center gap-2"><Radio className="size-4 text-brand-red"/>Realtime</span>
          <span className="flex items-center gap-2"><ShieldCheck className="size-4 text-brand-red"/>Bảo mật</span>
          <span className="flex items-center gap-2"><CheckCircle2 className="size-4 text-brand-red"/>Chính xác</span>
        </div>
      </div>
      <p className="relative text-xs text-blue-100/50">Thiên Long · Hệ thống quản lý sự kiện</p>
    </section>
    <section className="brand-page relative flex min-h-dvh flex-col px-5 py-6 sm:px-10">
      <div className="flex items-center justify-between lg:justify-start"><Link href="/" className="inline-flex min-h-10 items-center gap-2 text-xs font-medium text-muted transition hover:text-primary"><ArrowLeft className="size-3.5"/>Cổng sự kiện</Link><div className="rounded-lg bg-white px-3 py-1.5 shadow-sm lg:hidden"><BrandLogo priority className="w-32"/></div></div>
      <div className="m-auto w-full max-w-md py-10">
        <div className="card-shell page-enter relative overflow-hidden rounded-2xl p-7 sm:p-9">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-primary to-brand-red"/>
          <p className="mb-3 text-[11px] font-bold uppercase tracking-[.18em] text-primary">Ban tổ chức</p>
          <h2 className="text-3xl font-semibold tracking-[-.03em]">Đăng nhập quản trị</h2>
          <p className="mt-3 text-sm leading-6 text-muted">Sử dụng tài khoản được cấp cho sự kiện.</p>
          <form onSubmit={handleSubmit(submit)} className="mt-8 space-y-5">{error && <Alert>{error}</Alert>}<div><label htmlFor="email" className="mb-2 block text-sm font-semibold">Email</label><Input className="h-12" id="email" type="email" autoComplete="username" placeholder="ban.tochuc@congty.vn" {...register("email")} aria-invalid={!!errors.email}/>{errors.email && <p className="mt-1.5 text-xs text-red-700">{errors.email.message}</p>}</div><div><label htmlFor="password" className="mb-2 block text-sm font-semibold">Mật khẩu</label><Input className="h-12" id="password" type="password" autoComplete="current-password" {...register("password")} aria-invalid={!!errors.password}/>{errors.password && <p className="mt-1.5 text-xs text-red-700">{errors.password.message}</p>}</div><Button className="h-12 w-full" disabled={isSubmitting} type="submit">{isSubmitting ? <LoaderCircle className="animate-spin"/> : null}{isSubmitting ? "Đang đăng nhập…" : "Đăng nhập"}{!isSubmitting && <ArrowRight/>}</Button></form>
          <p className="mt-7 border-t border-border pt-5 text-xs leading-5 text-muted">Phiên quản trị chỉ được lưu trong tab trình duyệt và tự hết hạn theo cấu hình hệ thống.</p>
        </div>
      </div>
    </section>
  </main>;
}
