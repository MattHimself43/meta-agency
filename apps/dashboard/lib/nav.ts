export type NavItem = {
  href: string;
  label: string;
  icon: string;
  /** Phase in which the screen is built; later phases render as disabled entries. */
  phase: number;
  v2?: boolean;
  ownerOnly?: boolean;
};

export const CURRENT_PHASE = 1;

export const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: "Today",
    items: [
      { href: "/dashboard", label: "Home", icon: "home", phase: 0 },
      { href: "/dashboard/approvals", label: "Approvals", icon: "check", phase: 0 },
    ],
  },
  {
    section: "Sell",
    items: [
      { href: "/dashboard/leads", label: "Leads", icon: "users", phase: 1 },
      { href: "/dashboard/pipeline", label: "Pipeline", icon: "kanban", phase: 1 },
      { href: "/dashboard/outreach", label: "Outreach", icon: "send", phase: 1 },
    ],
  },
  {
    section: "Deliver",
    items: [
      { href: "/dashboard/clients", label: "Clients", icon: "briefcase", phase: 2 },
      { href: "/dashboard/creative", label: "Creative studio", icon: "image", phase: 2 },
      { href: "/dashboard/campaigns", label: "Campaigns", icon: "megaphone", phase: 2 },
      { href: "/dashboard/reports", label: "Reports", icon: "file", phase: 2 },
    ],
  },
  {
    section: "Business",
    items: [
      { href: "/dashboard/billing", label: "Billing", icon: "receipt", phase: 2, ownerOnly: true },
      { href: "/dashboard/analytics", label: "Analytics", icon: "chart", phase: 2 },
      { href: "/dashboard/time", label: "Time tracker", icon: "clock", phase: 3, v2: true },
    ],
  },
  {
    section: "System",
    items: [
      { href: "/dashboard/routines", label: "Routines", icon: "timer", phase: 0 },
      { href: "/dashboard/audit", label: "Audit log", icon: "scroll", phase: 0, ownerOnly: true },
      { href: "/dashboard/integrations", label: "Integrations", icon: "plug", phase: 3, ownerOnly: true },
      { href: "/dashboard/settings", label: "Settings", icon: "settings", phase: 0, ownerOnly: true },
    ],
  },
];
