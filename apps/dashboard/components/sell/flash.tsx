import { Notice } from "@/components/page-header";

const MESSAGES: Record<string, string> = {
  created: "Lead added.",
  duplicate: "That lead already exists — opened the existing record.",
  saved: "Saved.",
  moved: "Stage updated.",
  drafted: "Draft added to the approval queue.",
  sent: "Marked sent. The next step is scheduled.",
  research: "Research started. New leads appear here as each batch finishes (the rest run in the background).",
  adcheck: "Ad check done.",
  won: "Won! Client created with onboarding steps and a setup-fee invoice draft.",
};

/** Shows ?notice= / ?error= flashes set by server actions. */
export function Flash({ notice, error }: { notice?: string; error?: string }) {
  if (error) return <Notice tone="error">{error}</Notice>;
  if (!notice) return null;
  if (notice.startsWith("bulk:")) return <Notice>Updated {notice.slice(5)} lead(s).</Notice>;
  if (notice.startsWith("reply:")) return <Notice>Reply logged as “{notice.slice(6).replace("_", " ")}”. The sequence is stopped{notice.endsWith("stop") ? " and the lead is on do-not-contact" : " and a response draft is in the approval queue"}.</Notice>;
  return <Notice>{MESSAGES[notice] ?? notice}</Notice>;
}
