"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useAdmin } from "@/components/layout/admin-shell";

export function useAdminResource<T>(path: string) {
  const { token, version } = useAdmin();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const active = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    active.current?.abort();
    const controller = new AbortController(); active.current = controller;
    setLoading(true);
    try { const result = await api<T>(path, { token, signal: controller.signal }); if (!controller.signal.aborted) { setData(result); setError(null); } }
    catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Không thể tải dữ liệu."); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }, [path, token]);
  // Loading describes the lifecycle of an external request triggered by a query or SSE invalidation.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void refresh(); return () => active.current?.abort(); }, [refresh, version]);
  return { data, error, loading, refresh };
}
