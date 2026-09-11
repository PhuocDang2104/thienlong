"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarDays, MapPin, ArrowRight, Check, Minus, Plus, RotateCcw, LoaderCircle } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { api, ApiError } from "@/lib/api";
import { eventDate, eventTime, type Invitation } from "@/lib/public-api";
import { BrandLogo } from "@/components/brand-logo";

const button = "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#244aa5] px-5 text-sm font-semibold text-white shadow-[0_9px_22px_rgba(36,74,165,.24)] transition-[transform,background-color,box-shadow] hover:-translate-y-0.5 hover:bg-[#1c3d8d] hover:shadow-[0_12px_28px_rgba(36,74,165,.3)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-700 disabled:cursor-not-allowed disabled:opacity-50";

export function InvitationPage({ token }: { token: string }) {
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api<Invitation>(`/public/invitations/${encodeURIComponent(token)}`, { signal: controller.signal })
      .then(setInvitation)
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof ApiError && err.status === 404
          ? "Không tìm thấy thư mời này. Vui lòng kiểm tra lại đường dẫn hoặc liên hệ Ban tổ chức."
          : "Chưa thể tải thư mời. Vui lòng kiểm tra kết nối và thử lại.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [token, retry]);

  return (
    <main className="brand-page relative min-h-dvh overflow-hidden text-slate-900">
      <div aria-hidden className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-primary via-primary to-brand-red"/>
      <div className="relative mx-auto max-w-6xl px-5 py-7 sm:px-8 sm:py-10">
        <header className="flex items-center justify-between rounded-2xl border border-white/80 bg-white/90 px-4 py-3 shadow-[0_8px_28px_rgba(16,37,80,.07)] backdrop-blur sm:px-6">
          <BrandLogo priority className="w-36 sm:w-44"/>
          <span className="rounded-full bg-blue-50 px-3 py-2 text-[10px] font-bold uppercase tracking-[.14em] text-primary sm:text-xs">Thư mời sự kiện</span>
        </header>
        {loading ? (
          <div className="flex min-h-96 items-center justify-center gap-3 text-sm text-slate-500" role="status"><LoaderCircle className="size-5 animate-spin" />Đang mở thư mời…</div>
        ) : error || !invitation ? (
          <section className="card-shell mx-auto my-16 max-w-lg rounded-2xl p-8">
            <h1 className="text-2xl font-semibold tracking-tight">Chưa thể mở thư mời</h1>
            <p className="mt-3 leading-7 text-slate-600" role="alert">{error}</p>
            <button className={`${button} mt-6`} onClick={() => { setLoading(true); setError(""); setRetry((value) => value + 1); }}><RotateCcw className="size-4" />Thử lại</button>
          </section>
        ) : (
          <div className="page-enter grid gap-6 py-8 sm:py-12 lg:grid-cols-[1.08fr_.92fr] lg:items-start lg:gap-7">
            <section className="relative overflow-hidden rounded-2xl bg-[#123b88] p-7 text-white shadow-[0_22px_55px_rgba(13,45,108,.2)] sm:p-10 lg:min-h-[540px]">
              <div aria-hidden className="absolute -bottom-24 -right-20 size-72 rounded-full border-[52px] border-white/[.045]"/>
              <span className="absolute inset-y-0 left-0 w-1.5 bg-brand-red"/>
              <p className="relative mb-5 text-xs font-bold tracking-[.2em] text-blue-200">TRÂN TRỌNG KÍNH MỜI</p>
              <h1 className="relative max-w-lg text-4xl font-semibold leading-[1.13] tracking-[-.035em] sm:text-5xl">{invitation.event_name}</h1>
              <div className="relative mt-10 space-y-6 border-t border-white/15 pt-8">
                <div className="flex gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/10"><CalendarDays className="size-5 text-blue-100" /></span><div><p className="font-semibold capitalize">{eventDate(invitation.start_at)}</p><p className="mt-1 text-sm text-blue-100/70">{eventTime(invitation.start_at)} · Giờ Việt Nam</p></div></div>
                <div className="flex gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/10"><MapPin className="size-5 text-blue-100" /></span><p className="pt-2 leading-6 text-blue-50">{invitation.venue}</p></div>
              </div>
              <p className="relative mt-10 max-w-md text-sm leading-7 text-blue-100/75">Sự hiện diện của Quý khách là niềm vinh hạnh của chúng tôi.</p>
            </section>
            <RsvpForm invitation={invitation} token={token} onSaved={setInvitation} />
          </div>
        )}
        <footer className="border-t border-slate-200/80 py-6 text-xs font-medium leading-5 text-muted">Giữ lại mã QR trên thư mời để check-in khi đến sự kiện.</footer>
      </div>
    </main>
  );
}

function RsvpForm({ invitation, token, onSaved }: { invitation: Invitation; token: string; onSaved: (value: Invitation) => void }) {
  const schema = z.object({
    status: z.enum(["accepted", "declined"], { message: "Vui lòng chọn phản hồi của Quý khách." }),
    companions: z.number().int().min(0).max(invitation.max_companions),
    notes: z.string().trim().max(1000, "Lời nhắn tối đa 1.000 ký tự."),
  });
  type Values = z.infer<typeof schema>;
  const { register, handleSubmit, control, setValue, formState: { errors, isSubmitting } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      status: invitation.rsvp_status === "pending" ? undefined : invitation.rsvp_status,
      companions: invitation.companions,
      notes: invitation.notes,
    },
  });
  const [saved, setSaved] = useState(invitation.rsvp_status !== "pending");
  const [error, setError] = useState("");
  const status = useWatch({ control, name: "status" });
  const companions = useWatch({ control, name: "companions" });
  const submit = useCallback(async (values: Values) => {
    setError("");
    try {
      const response = await api<Invitation>(`/public/invitations/${encodeURIComponent(token)}/rsvp`, {
        method: "PUT", body: { status: values.status, companions: values.status === "declined" ? 0 : values.companions, notes: values.notes },
      });
      onSaved(response);
      setValue("companions", response.companions);
      setValue("notes", response.notes);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 409
        ? "Quý khách đã check-in tại sự kiện nên không thể thay đổi phản hồi. Vui lòng liên hệ Ban tổ chức nếu cần hỗ trợ."
        : "Chưa lưu được phản hồi. Vui lòng thử lại; lựa chọn của Quý khách vẫn được giữ nguyên.");
    }
  }, [token, onSaved, setValue]);

  return (
    <section className="card-shell relative self-start overflow-hidden rounded-2xl p-6 sm:p-9">
      <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-primary to-brand-red"/>
      <p className="text-xs font-bold uppercase tracking-widest text-primary">Khách mời</p>
      <h2 className="mt-2 break-words text-3xl font-bold tracking-[-.03em]">{invitation.guest_name}</h2>
      {invitation.company && <p className="mt-2 text-sm leading-6 text-slate-500">{invitation.company}</p>}
      {saved ? (
        <div className="mt-7 border-t border-slate-100 pt-7" role="status">
          <div className="mb-4 flex size-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-700"><Check className="size-5" /></div>
          <h3 className="text-lg font-semibold">Đã ghi nhận phản hồi</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">{invitation.rsvp_status === "accepted" ? `Quý khách đã xác nhận tham dự${invitation.companions ? ` cùng ${invitation.companions} người đi cùng` : ""}. Hẹn gặp Quý khách tại sự kiện.` : "Cảm ơn Quý khách đã phản hồi. Rất mong được đón tiếp Quý khách trong dịp tiếp theo."}</p>
          {invitation.notes && <p className="mt-4 border-l-2 border-blue-200 pl-3 text-sm leading-6 text-slate-600"><span className="font-semibold text-slate-800">Lời nhắn:</span> {invitation.notes}</p>}
          <button onClick={() => setSaved(false)} className="mt-6 min-h-11 text-sm font-semibold text-[#163c74] underline-offset-4 hover:underline">Thay đổi phản hồi</button>
        </div>
      ) : (
        <form onSubmit={handleSubmit(submit)} className="mt-7 border-t border-slate-100 pt-7">
          <fieldset disabled={isSubmitting}>
            <legend className="mb-4 text-base font-semibold">Quý khách có tham dự không?</legend>
            <div className="grid grid-cols-2 gap-3">
              {([{ value: "accepted", label: "Có, tôi tham dự" }, { value: "declined", label: "Không thể tham dự" }] as const).map((choice) => (
                <label key={choice.value} className={`flex min-h-16 cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm font-medium leading-5 transition-[border-color,background-color,box-shadow,transform] ${status === choice.value ? "-translate-y-0.5 border-primary bg-blue-50 text-primary shadow-[0_7px_18px_rgba(36,74,165,.12)]" : "border-slate-200 hover:border-blue-200 hover:bg-blue-50/40"}`}>
                  <input {...register("status")} value={choice.value} type="radio" className="size-4 shrink-0 accent-[#163c74]" /><span>{choice.label}</span>
                </label>
              ))}
            </div>
            {errors.status && <p className="mt-2 text-sm text-red-700" role="alert">{errors.status.message}</p>}
            {status === "accepted" && invitation.max_companions > 0 && (
              <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
                <div><p className="text-sm font-medium">Người đi cùng</p><p className="mt-1 text-xs text-slate-500">Tối đa {invitation.max_companions} người</p></div>
                <div className="flex items-center rounded-lg border border-slate-200">
                  <button type="button" aria-label="Giảm số người đi cùng" disabled={companions === 0} onClick={() => setValue("companions", companions - 1)} className="flex size-11 items-center justify-center disabled:opacity-30"><Minus className="size-4" /></button>
                  <output aria-label="Số người đi cùng" className="w-9 text-center text-base font-semibold tabular-nums">{companions}</output>
                  <button type="button" aria-label="Tăng số người đi cùng" disabled={companions >= invitation.max_companions} onClick={() => setValue("companions", companions + 1)} className="flex size-11 items-center justify-center disabled:opacity-30"><Plus className="size-4" /></button>
                </div>
              </div>
            )}
            <div className="mt-6">
              <label htmlFor="rsvp-notes" className="mb-2 block text-sm font-medium">Lời nhắn cho Ban tổ chức <span className="font-normal text-slate-500">(không bắt buộc)</span></label>
              <textarea id="rsvp-notes" rows={3} maxLength={1000} {...register("notes")} aria-invalid={!!errors.notes} className="w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm leading-6 outline-none transition-colors placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-blue-100" placeholder="Ví dụ: yêu cầu hỗ trợ di chuyển, chế độ ăn…" />
              {errors.notes && <p className="mt-1 text-sm text-red-700" role="alert">{errors.notes.message}</p>}
            </div>
            {error && <p className="mt-5 rounded-lg bg-red-50 p-3 text-sm leading-6 text-red-800" role="alert">{error}</p>}
            <button type="submit" className={`${button} mt-7 w-full`} disabled={isSubmitting}>
              {isSubmitting ? <><LoaderCircle className="size-4 animate-spin" />Đang lưu phản hồi…</> : <>Xác nhận phản hồi<ArrowRight className="size-4" /></>}
            </button>
          </fieldset>
        </form>
      )}
    </section>
  );
}
