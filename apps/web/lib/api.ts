const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000/api/v1").replace(/\/$/, "");
export function apiUrl(path: string) { return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`; }
export class ApiError extends Error {
  constructor(public status: number, public data: unknown) {
    const detail = typeof data === "object" && data !== null && "detail" in data ? (data as { detail: unknown }).detail : null;
    super(typeof detail === "string" ? detail : Array.isArray(detail) ? detail.map((item) => item.msg || "Dữ liệu không hợp lệ").join("; ") : status === 401 ? "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." : `Yêu cầu thất bại (${status}). Vui lòng thử lại.`);
    this.name = "ApiError";
  }
}
type ApiOptions = { method?: string; body?: unknown; token?: string; signal?: AbortSignal; timeoutMs?: number };
async function request<T>(path: string, options: ApiOptions, consume: (response: Response) => Promise<T>) {
  const form = typeof FormData !== "undefined" && options.body instanceof FormData;
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, options.timeoutMs || 20000);
  try {
    const response = await fetch(apiUrl(path), { method: options.method || "GET", headers: { ...(options.body && !form ? { "Content-Type": "application/json" } : {}), ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}) }, body: options.body === undefined ? undefined : form ? options.body as FormData : JSON.stringify(options.body), signal: controller.signal, cache: "no-store" });
    if (!response.ok) {
      const data: unknown = await response.json().catch(() => null);
      if (response.status === 401 && options.token && typeof window !== "undefined") window.dispatchEvent(new CustomEvent("thienlong:unauthorized", { detail: options.token }));
      throw new ApiError(response.status, data);
    }
    return await consume(response);
  } catch (error) {
    if (timedOut) throw new Error("Máy chủ phản hồi quá lâu. Kiểm tra kết quả trước khi thử lại thao tác vừa gửi.");
    if (options.signal?.aborted || error instanceof ApiError) throw error;
    throw new Error("Không thể kết nối máy chủ. Kiểm tra mạng và thử lại.");
  } finally { clearTimeout(timer); options.signal?.removeEventListener("abort", abort); }
}
export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> { return request<T>(path, options, (response) => response.json() as Promise<T>); }
export async function download(path: string, filename: string, token: string) {
  const blob = await request(path, { token, timeoutMs: 60000 }, (response) => response.blob());
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a"); link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
