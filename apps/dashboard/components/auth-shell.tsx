import { Ambient } from "@/components/ambient";

export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <Ambient />
      <div className="glass-strong w-full max-w-sm rounded-[22px] p-6 shadow-[0_40px_100px_-30px_rgba(0,0,0,0.8),0_0_0_1px_rgba(95,227,255,0.12)] sm:p-8">
        <div className="mb-7 flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/scalora-icon.svg" alt="" width={30} height={30} className="drop-shadow-[0_0_12px_rgba(95,227,255,0.35)]" />
          <span className="font-display text-lg font-semibold tracking-tight">AgencyOS</span>
        </div>
        <p className="kicker">Private</p>
        <h1 className="mt-2 font-display text-2xl font-semibold">{title}</h1>
        {subtitle ? <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p> : null}
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}
