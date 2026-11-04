import { LogOut, Menu } from "lucide-react";
import { requireStaffPage } from "@/lib/auth";
import { pendingCount } from "@/lib/approvals";
import { getSettings } from "@/lib/settings";
import { MobileTabs, SideNav } from "@/components/nav";
import { Ambient } from "@/components/ambient";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireStaffPage();
  const [pending, settings] = await Promise.all([pendingCount(), getSettings()]);

  const brand = (
    <div className="flex items-center gap-2.5 px-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/scalora-icon.svg" alt="" width={30} height={30} className="drop-shadow-[0_0_12px_rgba(95,227,255,0.35)]" />
      <div className="leading-tight">
        <p className="font-display text-[17px] font-semibold tracking-tight text-foreground">AgencyOS</p>
        <p className="text-[11px] text-muted-foreground">{settings.agencyName}</p>
      </div>
    </div>
  );
  const signOut = (
    <form action="/auth/signout" method="post">
      <button className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground">
        <LogOut className="h-4 w-4" /> Sign out
      </button>
    </form>
  );

  return (
    <div className="min-h-screen md:flex">
      <Ambient />
      <div className="hidden w-64 shrink-0 border-r border-[var(--line)] bg-[rgba(5,9,20,0.72)] backdrop-blur-xl md:block">
      <aside className="sticky top-0 flex h-screen flex-col gap-6 overflow-y-auto py-5">
        {brand}
        <div className="flex-1 px-2">
          <SideNav role={actor.role} pending={pending} />
        </div>
        <div className="px-2">
          <p className="truncate px-3 pb-1 text-[11px] text-[#5f6f92]">{actor.email}</p>
          {signOut}
        </div>
      </aside>
      </div>

      {/* Phone header with full menu */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-[var(--line)] bg-[rgba(5,9,20,0.72)] px-3 py-2.5 backdrop-blur-xl md:hidden">
        {brand}
        <details className="group relative">
          <summary className="btn-ghost-line list-none rounded-full p-2 text-foreground [&::-webkit-details-marker]:hidden" aria-label="Menu">
            <Menu className="h-5 w-5" />
          </summary>
          <div className="glass-strong absolute right-0 mt-2 max-h-[75vh] w-64 overflow-y-auto rounded-[22px] p-2 shadow-2xl">
            <SideNav role={actor.role} pending={pending} />
            <div className="mt-3 border-t border-[var(--line)] pt-2">{signOut}</div>
          </div>
        </details>
      </header>

      <main className="min-w-0 flex-1 px-4 pb-24 pt-6 sm:px-6 md:pb-12 md:pt-8 lg:px-10">{children}</main>
      <MobileTabs pending={pending} />
    </div>
  );
}
