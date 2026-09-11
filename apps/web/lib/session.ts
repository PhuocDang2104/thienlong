export type Role = "admin" | "pg";
export type Session = { access_token: string; expires_at: number; counter?: string };
type LoginResponse = { access_token: string; expires_in: number; counter?: string };
const key = (role: Role) => `thienlong_${role}_session`;
export function getSession(role: Role): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(key(role));
    if (!raw) return null;
    const session = JSON.parse(raw) as Session;
    if (!session.access_token || !Number.isFinite(session.expires_at) || session.expires_at <= Date.now()) { clearSession(role); return null; }
    return session;
  } catch { return null; }
}
export function saveSession(role: Role, response: LoginResponse): Session {
  const session = { access_token: response.access_token, expires_at: Date.now() + response.expires_in * 1000, counter: response.counter };
  window.sessionStorage.setItem(key(role), JSON.stringify(session));
  return session;
}
export function clearSession(role: Role) { if (typeof window !== "undefined") window.sessionStorage.removeItem(key(role)); }
