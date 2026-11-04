/** Onboarding checklist created for every new client (portal steps + owner-only checks). */
export const ONBOARDING_STEPS = [
  { stepKey: "agreement", label: "Sign the agreement", ownerOnly: false },
  { stepKey: "intake", label: "Intake form", ownerOnly: false },
  { stepKey: "assets", label: "Upload photos, videos, logo, brand colours", ownerOnly: false },
  { stepKey: "meta_access", label: "Give Meta partner access + add card to ad account", ownerOnly: false },
  { stepKey: "access_check", label: "Agency access verified (Page, ad account, pixel)", ownerOnly: true },
  { stepKey: "spending_limit", label: "Account spending limit set in Meta", ownerOnly: true },
] as const;
