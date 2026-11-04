/** Canonical Facebook page URL for duplicate detection: https://facebook.com/<path>, no query, no trailing slash. */
export function normalizeFacebookUrl(input: string | null | undefined): string | null {
  if (!input) return null;
  let s = input.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    const host = u.hostname.toLowerCase().replace(/^(www|m|web|mobile)\./, "");
    if (host !== "facebook.com" && host !== "fb.com") return null;
    if (u.pathname === "/profile.php" && u.searchParams.get("id")) return `https://facebook.com/profile.php?id=${u.searchParams.get("id")}`;
    const path = u.pathname.replace(/\/+$/, "").toLowerCase();
    return path ? `https://facebook.com${path}` : null;
  } catch {
    return null;
  }
}

export function normalizeUrl(input: string | null | undefined): string | null {
  if (!input?.trim()) return null;
  const s = input.trim();
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

export function firstName(name: string | null | undefined): string | null {
  const n = name?.trim().split(/\s+/)[0];
  return n || null;
}
