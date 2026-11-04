import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { resolvePortal } from "@/lib/portal";
import { getSettings } from "@/lib/settings";
import { Ambient } from "@/components/ambient";
import { Notice } from "@/components/page-header";

/** Resolve the token for a portal page (404 for bad links). */
export async function portalClient(token: string) {
  const r = await resolvePortal(token);
  if (r.status === "rate_limited") throw new Error("Too many requests — please try again in a few minutes.");
  if (r.status !== "ok") notFound();
  return r.client;
}

export async function PortalShell({ token, title, kicker, back = true, notice, error, children }: { token: string; title: string; kicker?: string; back?: boolean; notice?: string; error?: string; children: React.ReactNode }) {
  const settings = await getSettings();
  const agency = settings.agencyName.startsWith("[") ? "Your ads team" : settings.agencyName;
  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 pb-16 pt-6 sm:pt-10">
      <Ambient />
      <div className="mb-6 flex items-center gap-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/scalora-icon.svg" alt="" width={28} height={28} />
        <span className="font-display font-semibold">{agency}</span>
      </div>
      {back ? (
        <Link href={`/portal/${token}`} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-brand-cyan">
          <ArrowLeft className="h-4 w-4" /> All steps
        </Link>
      ) : null}
      {kicker ? <p className="kicker mb-2">{kicker}</p> : null}
      <h1 className="font-display text-[28px] font-semibold leading-tight tracking-[-0.03em]">{title}</h1>
      <div className="mt-4">
        {error ? <Notice tone="error">{error}</Notice> : null}
        {notice ? <Notice>{notice}</Notice> : null}
      </div>
      <div className="mt-2 space-y-5">{children}</div>
    </main>
  );
}
