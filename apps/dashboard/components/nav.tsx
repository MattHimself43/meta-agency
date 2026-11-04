"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3, Briefcase, Check, Clock, FileText, Home, Image, KanbanSquare, Megaphone, Plug, Receipt, ScrollText, Send, Settings, Timer, Users,
} from "lucide-react";
import { NAV, CURRENT_PHASE } from "@/lib/nav";
import { cn } from "@/lib/utils";

const ICONS = {
  home: Home, check: Check, users: Users, kanban: KanbanSquare, send: Send, briefcase: Briefcase, image: Image,
  megaphone: Megaphone, file: FileText, receipt: Receipt, chart: BarChart3, clock: Clock, timer: Timer, scroll: ScrollText,
  plug: Plug, settings: Settings,
} as const;

export function SideNav({ role, pending }: { role: string; pending: number }) {
  const path = usePathname();
  return (
    <nav className="space-y-5" aria-label="Main">
      {NAV.map((group) => (
        <div key={group.section}>
          <p className="px-3 pb-1.5 font-display text-[10.5px] font-medium uppercase tracking-[0.18em] text-[#5f6f92]">{group.section}</p>
          <ul className="space-y-0.5">
            {group.items
              .filter((i) => !(i.ownerOnly && role !== "owner"))
              .map((item) => {
                const Icon = ICONS[item.icon as keyof typeof ICONS] ?? Home;
                const built = item.phase <= CURRENT_PHASE;
                const active = item.href === "/dashboard" ? path === item.href : path.startsWith(item.href);
                const inner = (
                  <>
                    <Icon className="h-4 w-4" />
                    <span className="flex-1">{item.label}</span>
                    {item.href === "/dashboard/approvals" && pending > 0 ? (
                      <span className="btn-grad rounded-full px-1.5 text-[11px] font-semibold">{pending}</span>
                    ) : null}
                    {!built ? <span className="rounded-full border border-[var(--line)] px-1.5 text-[9.5px] text-[#5f6f92]">{item.v2 ? "v2" : `P${item.phase}`}</span> : null}
                  </>
                );
                return (
                  <li key={item.href}>
                    {built ? (
                      <Link
                        href={item.href}
                        className={cn(
                          "flex items-center gap-2.5 rounded-xl border border-transparent px-3 py-2 text-sm text-[#c2d1ef] transition-colors hover:bg-white/[0.04] hover:text-foreground",
                          active && "border-[var(--line-strong)] bg-[linear-gradient(100deg,rgba(46,107,255,0.22),rgba(95,227,255,0.06))] text-foreground shadow-[0_0_24px_-10px_rgba(95,227,255,0.6)] [&_svg]:text-brand-cyan",
                        )}
                      >
                        {inner}
                      </Link>
                    ) : (
                      <span
                        aria-disabled="true"
                        title={item.v2 ? "Coming in v2" : `Coming in Phase ${item.phase}`}
                        className="flex cursor-not-allowed items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-[#5f6f92]/70"
                      >
                        {inner}
                      </span>
                    )}
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Bottom tab bar on phones: the screens Matthias uses daily. */
export function MobileTabs({ pending }: { pending: number }) {
  const path = usePathname();
  const tabs = [
    { href: "/dashboard", label: "Home", Icon: Home },
    { href: "/dashboard/approvals", label: "Approve", Icon: Check },
    { href: "/dashboard/routines", label: "Routines", Icon: Timer },
    { href: "/dashboard/settings", label: "Settings", Icon: Settings },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-[var(--line)] bg-[rgba(5,9,20,0.85)] pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden" aria-label="Tabs">
      {tabs.map(({ href, label, Icon }) => {
        const active = href === "/dashboard" ? path === href : path.startsWith(href);
        return (
          <Link key={href} href={href} className={cn("relative flex flex-col items-center gap-0.5 py-2 text-[11px]", active ? "text-brand-cyan" : "text-muted-foreground")}>
            <Icon className="h-5 w-5" />
            {label}
            {href === "/dashboard/approvals" && pending > 0 ? (
              <span className="btn-grad absolute right-[26%] top-1 rounded-full px-1.5 text-[10px] font-semibold">{pending}</span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
