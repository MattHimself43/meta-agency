import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { isEnabled } from "@/lib/settings";
import { getIntegration, readSecret, saveSecret, updateConfig } from "@/lib/integrations/store";
import { baseUrl, httpJson } from "@/lib/integrations/http";
import { logAudit } from "@/lib/audit";
import { buildRawEmail, emailFromHeader, newReplyText } from "./mime";

/**
 * One Google connection (OAuth 2.0, offline access) for Gmail and Calendar.
 * The refresh token is stored encrypted; access tokens are minted per call and never leave the server.
 */
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
];
const AUTH_URL = () => baseUrl("GOOGLE_AUTH_URL", "https://accounts.google.com/o/oauth2/v2/auth");
const TOKEN_URL = () => baseUrl("GOOGLE_TOKEN_URL", "https://oauth2.googleapis.com/token");
const GMAIL = () => baseUrl("GMAIL_API_URL", "https://gmail.googleapis.com/gmail/v1");
const CAL = () => baseUrl("CALENDAR_API_URL", "https://www.googleapis.com/calendar/v3");

export function redirectUri() {
  return `${(process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "")}/api/integrations/google/callback`;
}

function clientCreds() {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!id || !secret) throw new Error("Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET first (see README → Google).");
  return { id, secret };
}

export function authUrl(state: string) {
  const { id } = clientCreds();
  const q = new URLSearchParams({ client_id: id, redirect_uri: redirectUri(), response_type: "code", scope: GOOGLE_SCOPES.join(" "), access_type: "offline", prompt: "consent", include_granted_scopes: "true", state });
  return `${AUTH_URL()}?${q}`;
}

const describe = (b: unknown) => {
  const e = b as { error_description?: string; error?: string | { message?: string } };
  return e?.error_description ?? (typeof e?.error === "string" ? e.error : e?.error?.message) ?? null;
};

/** OAuth callback: code → refresh token (stored encrypted) + the Gmail address it belongs to. */
export async function exchangeCode(code: string, actorId: string) {
  const { id, secret } = clientCreds();
  const tok = await httpJson<{ access_token: string; refresh_token?: string; expires_in: number; scope?: string }>("Google", TOKEN_URL(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: id, client_secret: secret, redirect_uri: redirectUri(), grant_type: "authorization_code" }),
  }, describe);
  if (!tok.refresh_token) throw new Error("Google didn't return a refresh token. Remove AgencyOS from your Google account's third-party access and connect again.");
  const profile = await httpJson<{ emailAddress?: string }>("Gmail", `${GMAIL()}/users/me/profile`, { headers: { Authorization: `Bearer ${tok.access_token}` } }, describe).catch(() => ({ emailAddress: undefined }));
  await saveSecret("google", tok.refresh_token, { label: profile.emailAddress ?? "Google account", config: { scopes: (tok.scope ?? "").split(" ").filter(Boolean), email: profile.emailAddress ?? null }, actorId });
  cached = { token: tok.access_token, exp: Date.now() + (tok.expires_in - 60) * 1000 };
  return { email: profile.emailAddress ?? null };
}

let cached: { token: string; exp: number } | null = null;
async function accessToken() {
  if (cached && cached.exp > Date.now()) return cached.token;
  const refresh = await readSecret("google");
  if (!refresh) throw new Error("Google isn't connected (Integrations → Google → Connect).");
  const { id, secret } = clientCreds();
  const tok = await httpJson<{ access_token: string; expires_in: number }>("Google", TOKEN_URL(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ refresh_token: refresh, client_id: id, client_secret: secret, grant_type: "refresh_token" }),
  }, describe);
  cached = { token: tok.access_token, exp: Date.now() + (tok.expires_in - 60) * 1000 };
  return tok.access_token;
}

async function google<T>(url: string, init: RequestInit = {}) {
  const t = await accessToken();
  return httpJson<T>("Google", url, { ...init, headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${t}` } }, describe);
}

export async function googleReady(flag: "gmail" | "google_calendar") {
  return (await isEnabled(flag)) && Boolean(await readSecret("google"));
}

export async function testGoogle() {
  const p = await google<{ emailAddress: string }>(`${GMAIL()}/users/me/profile`);
  return { label: p.emailAddress };
}

/* ----------------------------------------------------------------- Gmail */

/** Send an approved email message from Matthias's Gmail. Called only from his own "Send via Gmail" click. */
export async function sendGmail(m: { to: string; subject: string; body: string; threadId?: string | null }) {
  const integ = await getIntegration("google");
  const raw = buildRawEmail({ to: m.to, from: (integ.config.email as string) ?? null, subject: m.subject, body: m.body });
  return google<{ id: string; threadId: string }>(`${GMAIL()}/users/me/messages/send`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ raw, ...(m.threadId ? { threadId: m.threadId } : {}) }) });
}

type GmailMessage = { id: string; threadId: string; snippet?: string; payload?: { headers?: { name: string; value: string }[]; mimeType?: string; body?: { data?: string }; parts?: GmailMessage["payload"][] } };

function plainText(p: GmailMessage["payload"]): string {
  if (!p) return "";
  if (p.mimeType === "text/plain" && p.body?.data) return Buffer.from(p.body.data, "base64url").toString("utf8");
  for (const part of p.parts ?? []) {
    const t = plainText(part);
    if (t) return t;
  }
  return "";
}

/**
 * Reply sync: new inbox mail from a lead's email address becomes a logged reply (stops the sequence,
 * classifies it, drafts a response into the approval queue). Processed Gmail ids are remembered.
 */
export async function syncGmailReplies(record: (leadId: string, text: string) => Promise<unknown>) {
  if (!(await googleReady("gmail"))) return { skipped: true as const, matched: 0, scanned: 0 };
  const integ = await getIntegration("google");
  const seen = new Set((integ.config.seenGmailIds as string[] | undefined) ?? []);
  const list = await google<{ messages?: { id: string }[] }>(`${GMAIL()}/users/me/messages?${new URLSearchParams({ q: "in:inbox newer_than:3d -from:me", maxResults: "50" })}`);
  let matched = 0;
  const ids = (list.messages ?? []).map((m) => m.id).filter((id) => !seen.has(id));
  for (const id of ids) {
    seen.add(id);
    const msg = await google<GmailMessage>(`${GMAIL()}/users/me/messages/${id}?format=full`);
    const from = emailFromHeader(msg.payload?.headers?.find((h) => h.name.toLowerCase() === "from")?.value);
    if (!from) continue;
    const [lead] = await db.select().from(schema.leads).where(eq(schema.leads.email, from));
    if (!lead || lead.doNotContact) continue;
    const text = newReplyText(plainText(msg.payload) || msg.snippet || "");
    if (!text) continue;
    await record(lead.id, text.slice(0, 4000));
    matched++;
  }
  await updateConfig("google", { seenGmailIds: [...seen].slice(-500), lastSyncAt: new Date().toISOString() }, null);
  return { skipped: false as const, matched, scanned: ids.length };
}

/* -------------------------------------------------------------- Calendar */

export async function busyTimes(from: Date, to: Date) {
  const r = await google<{ calendars?: Record<string, { busy?: { start: string; end: string }[] }> }>(`${CAL()}/freeBusy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ timeMin: from.toISOString(), timeMax: to.toISOString(), timeZone: "America/Port_of_Spain", items: [{ id: "primary" }] }),
  });
  return r.calendars?.primary?.busy ?? [];
}

/** Put a booked discovery call on Matthias's own calendar. */
export async function createCalendarEvent(bookingId: string) {
  const [b] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, bookingId));
  if (!b) return null;
  const ev = await google<{ id: string; htmlLink?: string }>(`${CAL()}/calendars/primary/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      summary: `Call: ${b.businessName ?? b.name} (AgencyOS)`,
      description: [`${b.name} · ${b.phone ?? ""}`, b.email ?? "", b.notes ? `Notes: ${b.notes}` : "", `Lead: ${process.env.APP_URL ?? ""}/dashboard/leads/${b.leadId ?? ""}`].filter(Boolean).join("\n"),
      start: { dateTime: b.startsAt.toISOString(), timeZone: "America/Port_of_Spain" },
      end: { dateTime: b.endsAt.toISOString(), timeZone: "America/Port_of_Spain" },
      reminders: { useDefault: true },
    }),
  });
  await db.update(schema.bookings).set({ externalEventId: ev.id }).where(eq(schema.bookings.id, bookingId));
  await logAudit({ actorType: "system", actorId: null, action: "calendar.event_created", entityTable: "bookings", entityId: bookingId });
  return ev.id;
}

export async function todaysEvents(from: Date, to: Date) {
  const q = new URLSearchParams({ timeMin: from.toISOString(), timeMax: to.toISOString(), singleEvents: "true", orderBy: "startTime", maxResults: "20" });
  const r = await google<{ items?: { id: string; summary?: string; start?: { dateTime?: string; date?: string }; htmlLink?: string }[] }>(`${CAL()}/calendars/primary/events?${q}`);
  return (r.items ?? []).map((e) => ({ id: e.id, title: e.summary ?? "(no title)", start: e.start?.dateTime ?? e.start?.date ?? null, link: e.htmlLink ?? null }));
}
