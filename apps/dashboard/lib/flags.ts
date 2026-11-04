import type { FeatureFlags } from "@/lib/db/schema";

export const FLAG_INFO: Record<keyof FeatureFlags, { label: string; description: string; phase: string }> = {
  meta_api: {
    label: "Meta Marketing API",
    description: "Build campaigns (always PAUSED) and read insights through the API. Off = Manual mode: checklists + CSV import.",
    phase: "Phase 3 — needs a Meta developer app and business verification",
  },
  gmail: { label: "Gmail", description: "Send approved emails and sync replies through Gmail.", phase: "Phase 3" },
  google_calendar: { label: "Google Calendar", description: "Read busy times for /book and show today's calls.", phase: "Phase 3" },
  higgsfield: { label: "Higgsfield creative", description: "Generate image/video variants from the client's own photos.", phase: "Phase 3" },
  wipay: {
    label: "WiPay payments",
    description: "Hosted payment links on invoices. Off = bank transfer details and Mark paid by hand.",
    phase: "Phase 3 — after the business is registered",
  },
  team_seats: { label: "Team seats", description: "Invite account managers (no billing, settings, launches or budget raises).", phase: "v2" },
};

export const DEFAULT_FLAGS: FeatureFlags = {
  meta_api: false,
  gmail: false,
  google_calendar: false,
  higgsfield: false,
  wipay: false,
  team_seats: false,
};

export function withDefaultFlags(flags: Partial<FeatureFlags> | null | undefined): FeatureFlags {
  return { ...DEFAULT_FLAGS, ...(flags ?? {}) };
}
