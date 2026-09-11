"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { ArrowRight, Check, ChevronRight, CircleAlert, KeyRound, LoaderCircle, LogOut, QrCode, Search, Users, X } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { clearSession, getSession, saveSession, type Session } from "@/lib/session";
import { eventTime, rsvpLabels, type CheckinResult, type PgGuest, type PublicEvent } from "@/lib/public-api";
import { parseInvitationQr } from "@/lib/qr";
import { GuestQrScanner } from "./qr-scanner";
import { BrandLogo } from "@/components/brand-logo";

const inputClass = "min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900 shadow-[inset_0_1px_2px_rgba(16,37,80,.04)] outline-none transition-[border-color,box-shadow] placeholder:text-slate-400 focus:border-[#244aa5] focus:ring-4 focus:ring-blue-100/70 disabled:bg-slate-50";
const primaryClass = "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#244aa5] px-5 text-sm font-semibold text-white shadow-[0_9px_22px_rgba(36,74,165,.24)] transition-[transform,background-color,box-shadow] hover:-translate-y-0.5 hover:bg-[#1c3d8d] hover:shadow-[0_12px_28px_rgba(36,74,165,.3)] disabled:cursor-not-allowed disabled:opacity-50";
const subscribeHydration = () => () => {};

export function PgPage() {
  const [session, setSession] = useState<Session | null>(() => getSession("pg"));
  const initialized = useSyncExternalStore(subscribeHydration, () => true, () => false);
  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [eventError, setEventError] = useState("");
  const [eventRetry, setEventRetry] = useState(0);
  const [sessionMessage, setSessionMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    api<PublicEvent>("/public/event", { signal: controller.signal }).then(setEvent).catch(() => {
      if (!controller.signal.aborted) setEventError("Chưa tải được thông tin sự kiện. Kiểm tra kết nối và thử lại.");
    });
    return () => controller.abort();
  }, [eventRetry]);

  const expireSession = useCallback(() => {
    clearSession("pg"); setSession(null);
    setSessionMessage("Phiên làm việc đã hết hạn. Vui lòng nhập lại mã truy cập để tiếp tục.");
  }, []);

  useEffect(() => {
    if (!session) return;
    const timeout = window.setTimeout(expireSession, Math.max(0, session.expires_at - Date.now()));
    return () => window.clearTimeout(timeout);
  }, [session, expireSession]);

  return (
    <main className="brand-page relative min-h-dvh text-slate-900">
      <div aria-hidden className="fixed inset-x-0 top-0 z-50 h-1 bg-gradient-to-r from-primary via-primary to-brand-red"/>
      <header className="sticky top-0 z-30 border-b border-white/80 bg-white/92 shadow-[0_5px_24px_rgba(16,37,80,.07)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-4 px-5 py-4">
          <BrandLogo priority className="w-36"/>
          {session && <button type="button" onClick={() => { clearSession("pg"); setSession(null); setSessionMessage(""); }} className="flex min-h-11 items-center gap-2 text-xs font-medium text-slate-600" aria-label="Đăng xuất để đổi quầy"><LogOut className="size-4" />Đổi quầy</button>}
        </div>
      </header>
      <div className="page-enter mx-auto max-w-xl px-5 py-7 sm:py-10">
        {!initialized ? <p className="flex items-center justify-center gap-2 py-20 text-sm text-slate-500" role="status"><LoaderCircle className="size-5 animate-spin" />Đang mở quầy…</p>
          : session ? <CheckinDesk session={session} event={event} onExpired={expireSession} />
            : <PgLogin event={event} eventError={eventError} sessionMessage={sessionMessage} onRetry={() => { setEventError(""); setEventRetry((value) => value + 1); }} onLogin={(value) => { setSession(value); setSessionMessage(""); }} />}
      </div>
    </main>
  );
}

function PgLogin({ event, eventError, sessionMessage, onRetry, onLogin }: {
  event: PublicEvent | null; eventError: string; sessionMessage: string; onRetry: () => void; onLogin: (session: Session) => void;
}) {
  const [accessCode, setAccessCode] = useState("");
  const [counter, setCounter] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selectedCounter = counter || event?.counters[0] || "";

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); if (busy || !event || !selectedCounter) return;
    setBusy(true); setError("");
    try {
      const response = await api<{ access_token: string; expires_in: number; counter: string }>("/pg/session", { method: "POST", body: { access_code: accessCode, counter: selectedCounter } });
      saveSession("pg", response);
      const next = getSession("pg");
      if (!next) throw new Error("Session storage unavailable");
      onLogin(next);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? "Mã truy cập chưa đúng. Vui lòng kiểm tra lại với Ban tổ chức." : err instanceof ApiError && err.status === 429 ? "Có quá nhiều lần thử. Vui lòng chờ một phút rồi thử lại." : "Chưa thể đăng nhập. Kiểm tra kết nối và cho phép trình duyệt lưu phiên làm việc.");
    } finally { setBusy(false); }
  };

  return (
    <section className="card-shell relative overflow-hidden rounded-2xl p-6 sm:p-8">
      <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-primary to-brand-red"/>
      <div className="mb-6 flex size-12 items-center justify-center rounded-xl bg-blue-50 text-primary shadow-inner"><KeyRound className="size-5" /></div>
      <h1 className="text-2xl font-bold tracking-[-.025em]">Mở quầy check-in</h1>
      <p className="mt-2 text-sm leading-6 text-slate-500">{event?.name || "Dành cho nhân sự đón tiếp sự kiện"}</p>
      {sessionMessage && <p className="mt-5 rounded-lg bg-amber-50 p-3 text-sm leading-6 text-amber-900" role="alert">{sessionMessage}</p>}
      {eventError ? <div className="mt-6 rounded-lg bg-red-50 p-4"><p className="text-sm text-red-800" role="alert">{eventError}</p><button onClick={onRetry} className="mt-3 min-h-10 text-sm font-semibold text-red-800 underline">Thử lại</button></div> : !event ? <p role="status" className="mt-6 text-sm text-slate-500">Đang tải danh sách quầy…</p> : (
        <form onSubmit={submit} className="mt-7 space-y-5">
          <div><label htmlFor="pg-access-code" className="mb-2 block text-sm font-medium">Mã truy cập sự kiện</label><input id="pg-access-code" type="password" autoComplete="current-password" required maxLength={200} value={accessCode} onChange={(e) => setAccessCode(e.target.value)} disabled={busy} className={inputClass} placeholder="Nhập mã từ Ban tổ chức" /></div>
          <div><label htmlFor="pg-counter" className="mb-2 block text-sm font-medium">Quầy check-in</label><select id="pg-counter" value={selectedCounter} onChange={(e) => setCounter(e.target.value)} disabled={busy} className={inputClass} required>{event.counters.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
          {error && <p className="rounded-lg bg-red-50 p-3 text-sm leading-6 text-red-800" role="alert">{error}</p>}
          <button type="submit" className={`${primaryClass} w-full`} disabled={busy || !accessCode.trim() || !selectedCounter}>{busy ? <><LoaderCircle className="size-4 animate-spin" />Đang xác thực…</> : <>Bắt đầu check-in<ArrowRight className="size-4" /></>}</button>
          <p className="text-xs leading-5 text-slate-500">Chọn đúng quầy trước khi bắt đầu. Phiên làm việc chỉ được lưu trong tab trình duyệt này.</p>
        </form>
      )}
    </section>
  );
}

function CheckinDesk({ session, event, onExpired }: { session: Session; event: PublicEvent | null; onExpired: () => void }) {
  const [guest, setGuest] = useState<PgGuest | null>(null);
  const [result, setResult] = useState<CheckinResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState<{ query: string; guests: PgGuest[]; loading: boolean; error: string }>({ query: "", guests: [], loading: false, error: "" });
  const [searchRetry, setSearchRetry] = useState(0);
  const [qrValue, setQrValue] = useState("");
  const lookupController = useRef<AbortController | null>(null);
  const locked = useRef(false);
  const lastScan = useRef({ value: "", time: 0 });
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; lookupController.current?.abort(); };
  }, []);

  useEffect(() => {
    const value = query.trim();
    if (value.length < 2 || guest || result) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearch({ query: value, guests: [], loading: true, error: "" });
      try {
        const guests = await api<PgGuest[]>(`/pg/guests/search?q=${encodeURIComponent(value)}`, { token: session.access_token, signal: controller.signal });
        if (!controller.signal.aborted) setSearch({ query: value, guests, loading: false, error: "" });
      } catch (err) {
        if (controller.signal.aborted) return;
        if (err instanceof ApiError && err.status === 401) { onExpired(); return; }
        setSearch({ query: value, guests: [], loading: false, error: "Chưa tìm được khách. Kiểm tra kết nối rồi thử lại." });
      }
    }, 350);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, guest, result, searchRetry, session.access_token, onExpired]);

  const identify = useCallback(async (token: string) => {
    if (locked.current) return;
    locked.current = true;
    lookupController.current?.abort();
    const controller = new AbortController();
    lookupController.current = controller;
    setBusy(true); setError("");
    try {
      const response = await api<PgGuest>(`/pg/guests/by-token/${encodeURIComponent(token)}`, { token: session.access_token, signal: controller.signal });
      if (!controller.signal.aborted) { setGuest(response); setQuery(""); }
    } catch (err) {
      if (controller.signal.aborted) return;
      locked.current = false;
      if (err instanceof ApiError && err.status === 401) { onExpired(); return; }
      setError(err instanceof ApiError && err.status === 404 ? "Không tìm thấy khách từ mã QR này. Hãy kiểm tra thư mời hoặc tìm theo tên." : "Chưa nhận diện được khách. Kiểm tra kết nối rồi quét lại hoặc tìm theo tên.");
    } finally { if (!controller.signal.aborted) setBusy(false); }
  }, [session.access_token, onExpired]);

  const scan = useCallback((value: string) => {
    if (locked.current) return;
    const now = Date.now();
    if (lastScan.current.value === value && now - lastScan.current.time < 2000) return;
    lastScan.current = { value, time: now };
    const token = parseInvitationQr(value, window.location.origin);
    if (!token) { setError("Mã QR không phải thư mời của hệ thống này. Vui lòng quét đúng QR trên thư mời."); return; }
    void identify(token);
  }, [identify]);

  const reset = () => {
    setGuest(null); setResult(null); setError(""); setQrValue(""); setQuery("");
    setSearch({ query: "", guests: [], loading: false, error: "" });
    locked.current = false; lastScan.current = { value: "", time: 0 };
  };

  const confirm = async () => {
    if (!guest || busy || guest.checked_in_at) return;
    setBusy(true); setError("");
    try {
      const response = await api<CheckinResult>("/pg/checkins", { method: "POST", token: session.access_token, body: { guest_token: guest.guest_token, counter: session.counter } });
      if (mounted.current) setResult(response);
    } catch (err) {
      if (!mounted.current) return;
      if (err instanceof ApiError && err.status === 401) { onExpired(); return; }
      if (err instanceof ApiError && err.status === 409 && isCheckinResult(err.data)) setResult(err.data);
      else setError("Chưa nhận được kết quả check-in. Hãy thử lại để xác nhận trạng thái; hệ thống sẽ kiểm tra nếu khách đã được ghi nhận.");
    } finally { if (mounted.current) setBusy(false); }
  };

  const duplicate = result?.status === "already_checked_in" || (!result && Boolean(guest?.checked_in_at));
  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4"><div><h1 className="text-2xl font-bold tracking-[-.025em]">Check-in khách mời</h1><p className="mt-2 text-sm text-slate-500">{event?.name || "Sẵn sàng đón tiếp"}</p></div><span className="shrink-0 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-bold text-primary shadow-sm">{session.counter}</span></div>
      {result || guest ? (
        <section className="card-shell relative overflow-hidden rounded-2xl p-6 sm:p-8" aria-live="polite">
          <span className={`absolute inset-x-0 top-0 h-1 ${duplicate ? "bg-amber-500" : result ? "bg-emerald-500" : "bg-primary"}`}/>
          <div className={`mb-5 flex size-12 items-center justify-center rounded-full ${duplicate ? "bg-amber-50 text-amber-700" : result ? "bg-emerald-50 text-emerald-700" : "bg-[#eef3fa] text-[#163c74]"}`}>{duplicate ? <CircleAlert className="size-6" /> : result ? <Check className="size-6" /> : <Users className="size-6" />}</div>
          <p className={`text-xs font-semibold uppercase tracking-widest ${duplicate ? "text-amber-700" : result ? "text-emerald-700" : "text-slate-500"}`}>{duplicate ? "Khách đã check-in" : result ? "Check-in thành công" : "Xác nhận khách mời"}</p>
          <h2 className="mt-3 break-words text-3xl font-semibold leading-tight tracking-tight">{result?.guest_name || guest?.name}</h2>
          {(result?.company || guest?.company) && <p className="mt-3 text-base leading-6 text-slate-500">{result?.company || guest?.company}</p>}
          {result || duplicate ? (
            <div className={`mt-6 rounded-lg p-4 text-sm leading-6 ${duplicate ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-900"}`}>
              <p>{duplicate ? "Đã ghi nhận trước đó" : "Đã ghi nhận"} lúc <strong>{eventTime(result?.checked_in_at || guest!.checked_in_at!)}</strong> tại <strong>{result?.counter || guest?.counter}</strong>.</p>
              {duplicate && <p className="mt-1">Không cần check-in lại cho khách này.</p>}
            </div>
          ) : guest && (
            <dl className="mt-6 space-y-3 border-y border-slate-100 py-5 text-sm"><div className="flex justify-between gap-4"><dt className="text-slate-500">Phản hồi thư mời</dt><dd className="text-right font-medium">{rsvpLabels[guest.rsvp_status]}</dd></div><div className="flex justify-between gap-4"><dt className="text-slate-500">Người đăng ký đi cùng</dt><dd className="font-medium">{guest.companions}</dd></div></dl>
          )}
          {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm leading-6 text-red-800" role="alert">{error}</p>}
          {result || duplicate ? <button className={`${primaryClass} mt-6 w-full`} onClick={reset}>Khách tiếp theo<ArrowRight className="size-4" /></button> : <><button className={`${primaryClass} mt-6 min-h-14 w-full text-base`} disabled={busy} onClick={confirm}>{busy ? <><LoaderCircle className="size-5 animate-spin" />Đang check-in…</> : <><Check className="size-5" />Xác nhận check-in</>}</button><button disabled={busy} className="mt-3 min-h-11 w-full text-sm font-medium text-slate-500 disabled:opacity-40" onClick={reset}>Quay lại tìm khách</button></>}
        </section>
      ) : (
        <>
          {busy ? <div className="card-shell flex aspect-[4/3] items-center justify-center gap-3 rounded-2xl text-sm text-slate-500" role="status"><LoaderCircle className="size-5 animate-spin" />Đang nhận diện khách…</div> : <GuestQrScanner onScan={scan} />}
          {error && <div className="mt-4 flex items-start gap-3 rounded-lg bg-amber-50 p-4 text-sm leading-6 text-amber-900" role="alert"><CircleAlert className="mt-1 size-4 shrink-0" /><p className="flex-1">{error}</p><button aria-label="Đóng thông báo" className="flex size-8 shrink-0 items-center justify-center" onClick={() => setError("")}><X className="size-4" /></button></div>}
          <section className="mt-7 border-t border-slate-200 pt-7">
            <h2 className="text-base font-semibold">Tìm khách theo tên</h2><p className="mt-1 text-sm text-slate-500">Dùng khi khách không mang theo QR.</p>
            <div className="relative mt-4"><Search className="absolute left-3 top-4 size-4 text-slate-400" /><input aria-label="Tìm khách theo tên" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nhập ít nhất 2 ký tự…" maxLength={100} disabled={busy} className={`${inputClass} pl-10`} /></div>
            {query.trim().length >= 2 && (
              <div className="card-shell mt-3 overflow-hidden rounded-xl" aria-live="polite">
                {search.query !== query.trim() || search.loading ? <p className="p-4 text-sm text-slate-500">Đang tìm khách…</p> : search.error ? <div className="p-4"><p className="text-sm text-red-700">{search.error}</p><button onClick={() => setSearchRetry((value) => value + 1)} className="mt-2 min-h-10 text-sm font-semibold text-[#163c74]">Thử lại</button></div> : search.guests.length === 0 ? <p className="p-4 text-sm leading-6 text-slate-500">Không tìm thấy khách phù hợp. Thử tên khác hoặc liên hệ Ban tổ chức.</p> : <><ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto">{search.guests.map((item) => <li key={item.guest_token}><button disabled={busy} onClick={() => void identify(item.guest_token)} className="flex min-h-20 w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"><div className="min-w-0 flex-1"><p className="font-medium">{item.name}</p><p className="mt-1 text-xs text-slate-500">{item.company || "Chưa có đơn vị"}{item.checked_in_at ? " · Đã check-in" : ""}</p></div><ChevronRight className="size-4 shrink-0 text-slate-400" /></button></li>)}</ul>{search.guests.length === 30 && <p className="border-t border-slate-100 p-3 text-xs text-slate-500">Hiển thị 30 kết quả đầu tiên. Nhập tên cụ thể hơn để thu hẹp danh sách.</p>}</>}
              </div>
            )}
          </section>
          <details className="card-shell mt-6 rounded-xl p-4"><summary className="cursor-pointer text-sm font-semibold text-slate-600">Nhập đường dẫn QR</summary><form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); scan(qrValue); }}><label htmlFor="pg-qr-url" className="block text-xs leading-5 text-slate-500">Dán đường dẫn đầy đủ trên thư mời của khách.</label><input id="pg-qr-url" value={qrValue} onChange={(e) => setQrValue(e.target.value)} type="url" required maxLength={500} placeholder="https://…/i/…" className={inputClass} disabled={busy} /><button type="submit" className={`${primaryClass} w-full`} disabled={busy || !qrValue.trim()}><QrCode className="size-4" />Nhận diện khách</button></form></details>
        </>
      )}
    </div>
  );
}

function isCheckinResult(value: unknown): value is CheckinResult {
  return typeof value === "object" && value !== null && "status" in value && value.status === "already_checked_in" && "guest_name" in value && "checked_in_at" in value && "counter" in value;
}
