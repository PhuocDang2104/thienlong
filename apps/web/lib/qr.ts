/** Only invitation URLs from this application are accepted; never navigate to scanned URLs. */
export function parseInvitationQr(value: string, currentOrigin: string): string | null {
  try {
    const url = new URL(value.trim());
    const allowed = new Set([new URL(currentOrigin).origin]);
    if (process.env.NEXT_PUBLIC_APP_URL) {
      allowed.add(new URL(process.env.NEXT_PUBLIC_APP_URL).origin);
    }
    if (!allowed.has(url.origin) || !["https:", "http:"].includes(url.protocol)
      || url.username || url.password || url.search || url.hash) return null;
    return /^\/i\/([A-Za-z0-9_-]{22,128})\/?$/.exec(url.pathname)?.[1] ?? null;
  } catch {
    return null;
  }
}
