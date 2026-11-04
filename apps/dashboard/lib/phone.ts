/**
 * Trinidad & Tobago phone helpers. T&T is in the North American Numbering Plan: +1 868 XXX XXXX.
 * Local numbers are often written as 7 digits ("765-4321") or 10 ("868-765-4321").
 */
export function normalizeTtPhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const digits = input.replace(/\D/g, "");
  if (digits.length === 7) return `+1868${digits}`;
  if (digits.length === 10 && digits.startsWith("868")) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1868")) return `+${digits}`;
  // Other NANP numbers (e.g. a US WhatsApp number)
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length >= 8 && digits.length <= 15 && input.trim().startsWith("+")) return `+${digits}`;
  return null;
}

/**
 * Build a click-to-chat link. WhatsApp wants the number in international format with no "+", spaces or dashes.
 * We never send WhatsApp automatically: this link opens the chat with text pre-filled and Matthias presses send.
 */
export function waLink(phone: string, text?: string): string {
  const e164 = normalizeTtPhone(phone);
  if (!e164) throw new Error(`Not a valid phone number: ${phone}`);
  const base = `https://wa.me/${e164.slice(1)}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

export function formatTtPhone(e164: string | null | undefined): string {
  if (!e164) return "—";
  const m = /^\+1(868)(\d{3})(\d{4})$/.exec(e164);
  return m ? `+1 (${m[1]}) ${m[2]}-${m[3]}` : e164;
}
