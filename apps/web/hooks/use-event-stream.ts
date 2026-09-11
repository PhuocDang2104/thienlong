"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiUrl } from "@/lib/api";

export type StreamEvent = { id?: string; type: string; data: unknown };
export type StreamStatus = "connecting" | "connected" | "reconnecting" | "offline" | "error";
type Options = { path: string; token?: string; enabled?: boolean; onEvent: (event: StreamEvent) => void };

/** Fetch streams keep private JWTs in Authorization headers, never in the URL. */
export function useEventStream({ path, token, enabled = true, onEvent }: Options) {
  const [status, setStatus] = useState<StreamStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  const eventHandler = useRef(onEvent);
  const lastId = useRef("");
  const identity = useRef("");
  useEffect(() => { eventHandler.current = onEvent; }, [onEvent]);
  const reconnect = useCallback(() => setGeneration((value) => value + 1), []);

  useEffect(() => {
    if (!enabled) return;
    const nextIdentity = `${path}|${token || ""}`;
    if (identity.current !== nextIdentity) { lastId.current = ""; identity.current = nextIdentity; }
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    let headersTimeout: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    let controller = new AbortController();
    const connect = async () => {
      if (disposed) return;
      controller = new AbortController();
      setStatus(navigator.onLine ? attempts ? "reconnecting" : "connecting" : "offline");
      try {
        headersTimeout = setTimeout(() => controller.abort(), 20000);
        const response = await fetch(apiUrl(path), { headers: { Accept: "text/event-stream", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(lastId.current ? { "Last-Event-ID": lastId.current } : {}) }, cache: "no-store", signal: controller.signal });
        clearTimeout(headersTimeout);
        if (response.status === 401 || response.status === 403 || response.status === 404) {
          if (response.status === 401 && token) window.dispatchEvent(new CustomEvent("thienlong:unauthorized", { detail: token }));
          setStatus("error"); setError("Không thể mở kết nối trực tiếp. Kiểm tra quyền truy cập hoặc đăng nhập lại."); return;
        }
        if (!response.ok || !response.body || !response.headers.get("content-type")?.includes("text/event-stream")) throw new Error("Không thể mở kết nối trực tiếp.");
        setStatus("connected"); setError(null); attempts = 0;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        const touch = () => { if (watchdog) clearTimeout(watchdog); watchdog = setTimeout(() => controller.abort(), 35000); };
        touch();
        while (!disposed) {
          const { value, done } = await reader.read();
          if (done) break;
          touch();
          buffer += decoder.decode(value, { stream: true });
          let boundary: RegExpExecArray | null;
          while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
            const frame = buffer.slice(0, boundary.index);
            buffer = buffer.slice(boundary.index + boundary[0].length);
            let type = "message"; let id: string | undefined; const data: string[] = [];
            for (const line of frame.split(/\r?\n/)) {
              if (line.startsWith(":")) continue;
              const split = line.indexOf(":");
              const key = split < 0 ? line : line.slice(0, split);
              const content = split < 0 ? "" : line.slice(split + 1).replace(/^ /, "");
              if (key === "event") type = content;
              else if (key === "id" && !content.includes("\0")) id = content;
              else if (key === "data") data.push(content);
            }
            if (id !== undefined) lastId.current = id;
            if (data.length) {
              let payload: unknown;
              try { payload = JSON.parse(data.join("\n")); } catch { continue; }
              eventHandler.current({ type, id, data: payload });
              if (type === "session_expired" && token) {
                window.dispatchEvent(new CustomEvent("thienlong:unauthorized", { detail: token }));
                setStatus("error"); setError("Phiên đăng nhập đã hết hạn."); controller.abort(); return;
              }
            }
          }
          if (buffer.length > 1024 * 1024) throw new Error("Luồng dữ liệu không hợp lệ.");
        }
        if (!disposed) throw new Error("Kết nối trực tiếp bị gián đoạn.");
      } catch {
        if (disposed) return;
        setStatus(navigator.onLine ? "reconnecting" : "offline");
        setError("Đang kết nối lại. Dữ liệu hiển thị có thể chưa cập nhật.");
        attempts += 1;
        const delay = Math.min(30000, 1000 * 2 ** Math.min(attempts, 5)) + Math.random() * 500;
        timer = setTimeout(connect, delay);
      } finally { if (watchdog) clearTimeout(watchdog); if (headersTimeout) clearTimeout(headersTimeout); }
    };
    const wake = () => { if (timer) clearTimeout(timer); controller.abort(); reconnect(); };
    window.addEventListener("online", wake);
    void connect();
    return () => { disposed = true; controller.abort(); if (timer) clearTimeout(timer); if (watchdog) clearTimeout(watchdog); if (headersTimeout) clearTimeout(headersTimeout); window.removeEventListener("online", wake); };
  }, [path, token, enabled, generation, reconnect]);
  return { status, error, reconnect };
}
