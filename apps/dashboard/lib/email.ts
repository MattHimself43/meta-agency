import "server-only";

/**
 * System email (digest, urgent alerts, portal links) through Resend's REST API until Gmail is connected.
 * Returns { skipped } instead of throwing when RESEND_API_KEY is not configured.
 */
export async function sendSystemEmail(msg: { to: string; subject: string; html: string; text?: string; from?: string }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { skipped: true as const, reason: "RESEND_API_KEY not set" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: msg.from ?? process.env.EMAIL_FROM ?? "AgencyOS <onboarding@resend.dev>",
      to: [msg.to],
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
    }),
  });
  if (!res.ok) throw new Error(`Resend error ${res.status}: ${await res.text()}`);
  return { skipped: false as const, id: ((await res.json()) as { id?: string }).id };
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
