"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useEventStream, type StreamEvent } from "@/hooks/use-event-stream";
import { isWelcomeGuest, type WelcomeGuest, type WelcomeSnapshot } from "@/lib/public-api";
import { BrandLogo } from "@/components/brand-logo";

const DISPLAY_MS = 7000;
const MAX_QUEUE = 50;
const MAX_SEEN = 1000;

/** Arrival events queue locally while each guest receives a complete seven-second greeting. */
export function WelcomeDisplay({ screenToken }: { screenToken: string }) {
  const [eventName, setEventName] = useState("THIÊN LONG");
  const [current, setCurrent] = useState<WelcomeGuest | null>(null);
  const [snapshotError, setSnapshotError] = useState("");
  const queue = useRef<WelcomeGuest[]>([]);
  const seen = useRef(new Set<number>());
  const active = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const snapshotController = useRef<AbortController | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
      snapshotController.current?.abort();
      queue.current = [];
      active.current = false;
    };
  }, []);

  const enqueue = useCallback((guest: WelcomeGuest, snapshot = false) => {
    if (!mounted.current || seen.current.has(guest.id)) return;
    seen.current.add(guest.id);
    if (seen.current.size > MAX_SEEN) seen.current.delete(seen.current.values().next().value!);
    // An old snapshot on reload must not greet a guest who has long since left reception.
    if (snapshot && Date.now() - Date.parse(guest.checked_in_at) > 10000) return;
    queue.current.push(guest);
    // Keep the newest arrivals during unusually long bursts; memory use stays bounded.
    if (queue.current.length > MAX_QUEUE) queue.current.shift();
    if (active.current) return;
    const next = () => {
      if (!mounted.current) return;
      const nextGuest = queue.current.shift();
      active.current = Boolean(nextGuest);
      setCurrent(nextGuest || null);
      if (nextGuest) timer.current = setTimeout(next, DISPLAY_MS);
    };
    next();
  }, []);

  const loadSnapshot = useCallback(() => {
    snapshotController.current?.abort();
    const controller = new AbortController();
    snapshotController.current = controller;
    return api<WelcomeSnapshot>(`/public/welcome/${encodeURIComponent(screenToken)}`, { signal: controller.signal }).then((response) => {
      if (controller.signal.aborted || !mounted.current) return;
      setEventName(response.event_name);
      setSnapshotError("");
      if (isWelcomeGuest(response.latest_guest)) enqueue(response.latest_guest, true);
    }).catch((err: unknown) => {
      if (controller.signal.aborted || !mounted.current) return;
      setSnapshotError(err instanceof ApiError && err.status === 404 ? "Đường dẫn màn hình không hợp lệ" : "Chưa tải được thông tin sự kiện");
    });
  }, [screenToken, enqueue]);

  const handleEvent = useCallback((event: StreamEvent) => {
    // Stream subscription exists before ready. The snapshot therefore cannot leave a gap.
    if (event.type === "ready") void loadSnapshot();
    if (event.type === "checkin" && isWelcomeGuest(event.data)) enqueue(event.data);
  }, [loadSnapshot, enqueue]);

  const { status } = useEventStream({ path: `/public/welcome/${encodeURIComponent(screenToken)}/stream`, onEvent: handleEvent });

  // The event title remains available even when the realtime connection cannot open.
  useEffect(() => { void loadSnapshot(); }, [loadSnapshot]);

  const connectionLabel = snapshotError || (status === "connected" ? "Đang kết nối trực tiếp" : status === "offline" ? "Mất kết nối mạng" : status === "error" ? "Không thể mở màn hình. Kiểm tra đường dẫn." : status === "reconnecting" ? "Đang kết nối lại…" : "Đang kết nối…");

  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden bg-[#0b2861] px-7 py-8 text-white sm:px-16 sm:py-12">
      <div aria-hidden className="absolute -right-[12vw] -top-[30vw] size-[65vw] rounded-full border-[9vw] border-white/[.025]"/>
      <div aria-hidden className="absolute inset-y-0 left-0 w-1.5 bg-brand-red"/>
      <header className="relative flex items-center justify-between gap-6 border-b border-white/15 pb-7">
        <div className="rounded-xl bg-white px-4 py-2 shadow-[0_12px_35px_rgba(0,0,0,.2)]"><BrandLogo priority className="w-36 sm:w-48"/></div>
        <p className="max-w-[50%] text-right text-xs font-medium uppercase tracking-[.12em] text-slate-400 sm:text-sm">{eventName}</p>
      </header>
      <section key={current?.id || "idle"} className="welcome-enter relative flex flex-1 flex-col items-center justify-center py-16 text-center" aria-live="polite" aria-atomic="true">
        <p className="text-sm font-semibold tracking-[.4em] text-blue-200/70 sm:text-xl">TRÂN TRỌNG CHÀO ĐÓN</p>
        <div className="my-8 flex items-center gap-2 sm:my-10"><span className="h-1 w-9 bg-white/65"/><span className="size-2 rotate-45 bg-brand-red"/><span className="h-1 w-9 bg-white/65"/></div>
        <h1 className={`max-w-[1500px] break-words font-bold leading-[1.12] tracking-[-.045em] drop-shadow-[0_12px_35px_rgba(0,0,0,.2)] ${current ? "text-[clamp(2.75rem,7.5vw,9rem)]" : "text-[clamp(2.75rem,6vw,7.5rem)]"}`}>{current ? current.name : eventName}</h1>
        {current?.company ? <p className="mt-7 max-w-5xl break-words text-[clamp(1.25rem,2.5vw,3rem)] font-medium leading-snug text-blue-100/80">{current.company}</p> : !current && <p className="mt-7 text-base text-blue-100/60 sm:text-xl">Hân hạnh được đón tiếp Quý khách</p>}
      </section>
      <footer className="relative flex items-center justify-between gap-4 text-[10px] font-medium text-blue-100/45 sm:text-xs">
        <span>CHÀO MỪNG QUÝ KHÁCH</span>
        <span className="flex items-center gap-2" role="status"><span className={`size-1.5 shrink-0 rounded-full ${status === "connected" && !snapshotError ? "live-dot bg-emerald-400" : "bg-amber-400"}`} />{connectionLabel}</span>
      </footer>
    </main>
  );
}
