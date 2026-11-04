/** Pure helpers for Gmail (RFC 2822 message → base64url `raw`) and Calendar busy filtering. */

function encodeHeader(v: string) {
  // Non-ASCII subjects/names must be RFC 2047 encoded.
  return /^[\x20-\x7e]*$/.test(v) ? v : `=?UTF-8?B?${Buffer.from(v, "utf8").toString("base64")}?=`;
}

function cleanHeader(v: string) {
  // No header injection: strip CR/LF.
  return v.replace(/[\r\n]+/g, " ").trim();
}

export function buildRawEmail(m: { to: string; from?: string | null; subject: string; body: string; inReplyTo?: string | null }) {
  if (!/^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/.test(m.to.trim())) throw new Error("That email address doesn't look right.");
  const lines = [
    `To: ${cleanHeader(m.to)}`,
    ...(m.from ? [`From: ${cleanHeader(m.from)}`] : []),
    `Subject: ${encodeHeader(cleanHeader(m.subject))}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    ...(m.inReplyTo ? [`In-Reply-To: ${cleanHeader(m.inReplyTo)}`, `References: ${cleanHeader(m.inReplyTo)}`] : []),
    "",
    Buffer.from(m.body.replace(/\r?\n/g, "\r\n"), "utf8").toString("base64").replace(/(.{76})/g, "$1\r\n"),
  ];
  return Buffer.from(lines.join("\r\n"), "utf8").toString("base64url");
}

/** "Alicia <alicia@x.tt>" → "alicia@x.tt" */
export function emailFromHeader(v: string | undefined | null) {
  const m = (v ?? "").match(/<([^>]+)>/) ?? (v ?? "").match(/([^\s<>]+@[^\s<>]+)/);
  return m?.[1]?.trim().toLowerCase() ?? null;
}

/** Strip quoted history ("On … wrote:", "> …") so only the new reply text is classified. */
export function newReplyText(body: string) {
  const out: string[] = [];
  for (const line of body.replace(/\r\n/g, "\n").split("\n")) {
    if (/^On .+wrote:$/i.test(line.trim()) || /^-{2,}\s*Original Message/i.test(line.trim())) break;
    if (line.startsWith(">")) continue;
    out.push(line);
  }
  return out.join("\n").trim();
}

/** Drop slots that overlap any busy interval from Google Calendar. */
export function filterBusy(slots: Date[], busy: { start: string; end: string }[], slotMinutes: number) {
  const ranges = busy.map((b) => [Date.parse(b.start), Date.parse(b.end)] as const).filter(([s, e]) => s < e);
  return slots.filter((s) => {
    const a = s.getTime();
    const b = a + slotMinutes * 60_000;
    return !ranges.some(([s2, e2]) => a < e2 && s2 < b);
  });
}
