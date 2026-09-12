/** Extract only a token-shaped value; the Thiên Long API performs the authoritative lookup. */
export function parseInvitationQr(value: string, currentOrigin: string): string | null {
  try {
    const url = new URL(value.trim());
    const current = new URL(currentOrigin);
    const localHttp = url.protocol === "http:" && url.origin === current.origin && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if ((url.protocol !== "https:" && !localHttp) || url.username || url.password || url.search || url.hash) return null;
    return /^\/i\/([A-Za-z0-9_-]{22,128})\/?$/.exec(url.pathname)?.[1] ?? null;
  } catch {
    return null;
  }
}
