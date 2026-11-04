import Link from "next/link";
import { CheckCircle2, CircleDashed, PlugZap, TriangleAlert, XCircle } from "lucide-react";
import { requireOwnerPage } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { listIntegrations, type IntegrationStatus, type SafeIntegration } from "@/lib/integrations/store";
import { formatAst } from "@/lib/time";
import { redirectUri } from "@/lib/google";
import { responseUrl } from "@/lib/payments/wipay";
import { META_API_VERSION } from "@/lib/meta/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Notice, PageHeader } from "@/components/page-header";
import { disconnectAction, saveHiggsfieldAction, saveMetaTokenAction, saveWipayAction, testIntegrationAction } from "../connect-actions";
import type { FeatureFlags } from "@/lib/db/schema";

export const metadata = { title: "Integrations" };
export const dynamic = "force-dynamic";

type Shown = IntegrationStatus | "flag_off";
const LABEL: Record<Shown, string> = { connected: "Connected", expired: "Expired", not_set_up: "Not set up", disabled: "Disabled", error: "Error", flag_off: "Disabled (flag off)" };
function StatusBadge({ s }: { s: Shown }) {
  const Icon = s === "connected" ? CheckCircle2 : s === "error" || s === "expired" ? XCircle : s === "flag_off" ? CircleDashed : TriangleAlert;
  return (
    <Badge variant={s === "connected" ? "low" : s === "error" || s === "expired" ? "high" : "muted"}>
      <Icon className="h-3 w-3" /> {LABEL[s]}
    </Badge>
  );
}

function shown(i: SafeIntegration, ready: boolean, flag?: boolean): Shown {
  if (flag === false) return "flag_off";
  if (i.status === "error" || i.status === "expired") return i.status;
  return ready ? "connected" : "not_set_up";
}

function Meta({ i }: { i: SafeIntegration }) {
  return (
    <p className="text-xs text-muted-foreground">
      {i.accountLabel ? <>Account: <span className="text-foreground">{i.accountLabel}</span> · </> : null}
      {i.lastCheckedAt ? `Last checked ${formatAst(i.lastCheckedAt)}` : "Never checked"}
      {i.lastError ? <span className="mt-1 block text-red-300">Last error: {i.lastError}</span> : null}
    </p>
  );
}

function TestButton({ provider, disabled }: { provider: string; disabled?: boolean }) {
  return (
    <form action={testIntegrationAction}>
      <input type="hidden" name="provider" value={provider} />
      <Button size="sm" variant="outline" disabled={disabled}><PlugZap /> Test</Button>
    </form>
  );
}

function Disconnect({ provider }: { provider: string }) {
  return (
    <form action={disconnectAction}>
      <input type="hidden" name="provider" value={provider} />
      <Button size="sm" variant="ghost">Disconnect</Button>
    </form>
  );
}

export default async function IntegrationsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; notice?: string }> }) {
  await requireOwnerPage();
  const sp = await searchParams;
  const [all, settings] = await Promise.all([listIntegrations(), getSettings()]);
  const f: FeatureFlags = settings.featureFlags;
  const env = {
    google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    metaApp: Boolean(process.env.META_APP_SECRET),
    higgsfield: Boolean(process.env.HIGGSFIELD_API_KEY),
    wipayLive: process.env.WIPAY_ENVIRONMENT === "live",
    wipayCreds: Boolean(process.env.WIPAY_ACCOUNT_NUMBER && process.env.WIPAY_API_KEY),
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    resend: Boolean(process.env.RESEND_API_KEY),
    encryption: Boolean(process.env.TOKEN_ENCRYPTION_KEY),
  };
  const hf = all.higgsfield.config;

  return (
    <>
      <PageHeader kicker="System" title="Integrations" description="Every integration is optional. With a flag off (Settings → Feature flags) AgencyOS works in Manual mode." />
      {sp.ok || (sp.notice && sp.notice !== "saved") ? <Notice>{sp.ok ?? sp.notice}</Notice> : sp.notice ? <Notice>Saved.</Notice> : null}
      {sp.error ? <Notice tone="error">{sp.error}</Notice> : null}
      {!env.encryption ? <Notice tone="error">TOKEN_ENCRYPTION_KEY isn&apos;t set, so tokens can&apos;t be stored. Add it in Vercel (any 32-byte base64 value) and redeploy.</Notice> : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>Meta Marketing API</CardTitle>
              <StatusBadge s={shown(all.meta, all.meta.hasSecret, f.meta_api)} />
            </div>
            <CardDescription>
              Builds approved plans in the client&apos;s ad account as <b>PAUSED</b>, reads insights each morning, checks access. Only your Launch button can switch anything on. API {META_API_VERSION}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Meta i={all.meta} />
            <form action={saveMetaTokenAction} className="space-y-2">
              <Field label={all.meta.hasSecret ? "Replace System User token" : "System User token"} hint="Business Settings → Users → System users → Generate token (ads_management, ads_read, business_management, pages_show_list, pages_read_engagement, leads_retrieval). Stored encrypted; never shown again.">
                <Input name="token" type="password" autoComplete="off" required />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button size="sm">Save token</Button>
              </div>
            </form>
            <div className="flex flex-wrap gap-2">
              <TestButton provider="meta" disabled={!all.meta.hasSecret} />
              {all.meta.hasSecret ? <Disconnect provider="meta" /> : null}
            </div>
            {!env.metaApp ? <p className="text-xs text-muted-foreground">Tip: set META_APP_SECRET so every call carries appsecret_proof.</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>Google (Gmail + Calendar)</CardTitle>
              <StatusBadge s={shown(all.google, all.google.hasSecret, f.gmail || f.google_calendar)} />
            </div>
            <CardDescription>
              Gmail: send approved emails from your address and pick up replies. Calendar: hide busy times on /book and add booked calls. Flags: Gmail {f.gmail ? "on" : "off"}, Calendar {f.google_calendar ? "on" : "off"}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Meta i={all.google} />
            {!env.google ? <p className="text-sm text-amber-200">Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET first. Authorised redirect URI: <code className="break-all text-xs">{redirectUri()}</code></p> : null}
            <div className="flex flex-wrap gap-2">
              {env.google ? (
                <Button asChild size="sm"><a href="/api/integrations/google/start">{all.google.hasSecret ? "Reconnect Google" : "Connect Google"}</a></Button>
              ) : (
                <Button size="sm" disabled>Connect Google</Button>
              )}
              <TestButton provider="google" disabled={!all.google.hasSecret} />
              {all.google.hasSecret ? <Disconnect provider="google" /> : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>WiPay</CardTitle>
              <StatusBadge s={f.wipay ? (env.wipayLive && !env.wipayCreds ? "error" : "connected") : "flag_off"} />
            </div>
            <CardDescription>
              Card payments on invoices through WiPay&apos;s hosted page. Mode: <b>{env.wipayLive ? "live" : "sandbox"}</b>{env.wipayLive ? "" : " (public test account — no real money)"}. Payments are only marked paid after WiPay&apos;s response hash checks out.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Meta i={all.wipay} />
            <p className="text-xs text-muted-foreground">Response URL: <code className="break-all">{responseUrl()}</code></p>
            <form action={saveWipayAction} className="flex flex-wrap items-end gap-2">
              <Field label="Who pays the card fee">
                <select name="feeStructure" defaultValue={(all.wipay.config.feeStructure as string) ?? "customer_pay"} className="h-10 rounded-xl border border-[var(--line-strong)] bg-[rgba(5,9,20,0.6)] px-3 text-sm">
                  <option value="customer_pay">Client pays the fee</option>
                  <option value="merchant_absorb">Agency absorbs the fee</option>
                  <option value="split">Split</option>
                </select>
              </Field>
              <Button size="sm" variant="secondary">Save</Button>
            </form>
            <TestButton provider="wipay" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>Higgsfield</CardTitle>
              <StatusBadge s={shown(all.higgsfield, env.higgsfield || all.higgsfield.hasSecret, f.higgsfield)} />
            </div>
            <CardDescription>Image and video variants from the client&apos;s own photos (1:1, 4:5, 9:16). Off = generate elsewhere and upload.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Meta i={all.higgsfield} />
            <form action={saveHiggsfieldAction} className="space-y-2">
              {env.higgsfield ? <p className="text-xs text-muted-foreground">Using HIGGSFIELD_API_KEY from the environment.</p> : (
                <Field label={all.higgsfield.hasSecret ? "Replace API key" : "API key"} hint="KEY_ID:KEY_SECRET from console.higgsfield.ai. Stored encrypted.">
                  <Input name="key" type="password" autoComplete="off" />
                </Field>
              )}
              <div className="grid gap-2 sm:grid-cols-2">
                <Field label="Video model path" hint="Default higgsfield-ai/dop/standard"><Input name="videoModel" defaultValue={(hf.videoModel as string) ?? ""} placeholder="higgsfield-ai/dop/standard" /></Field>
                <Field label="Image model path" hint="An image-edit model from the console"><Input name="imageModel" defaultValue={(hf.imageModel as string) ?? ""} /></Field>
              </div>
              <Field label="Extra parameters (JSON)" hint="Sent with every request, per the model's docs"><Textarea name="extraParams" rows={2} defaultValue={hf.extraParams ? JSON.stringify(hf.extraParams) : ""} placeholder='{"resolution":"720p"}' /></Field>
              <Button size="sm">Save</Button>
            </form>
            <div className="flex flex-wrap gap-2">
              <TestButton provider="higgsfield" disabled={!env.higgsfield && !all.higgsfield.hasSecret} />
              {all.higgsfield.hasSecret ? <Disconnect provider="higgsfield" /> : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>Anthropic (Claude)</CardTitle>
              <StatusBadge s={env.anthropic ? (all.anthropic.status === "error" ? "error" : "connected") : "not_set_up"} />
            </div>
            <CardDescription>All AI drafts. Without a key, drafts come from templates. Cost per month is in Settings.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Meta i={all.anthropic} />
            <TestButton provider="anthropic" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>Resend (system email)</CardTitle>
              <StatusBadge s={env.resend ? "connected" : "not_set_up"} />
            </div>
            <CardDescription>The 07:15 digest and urgent alerts to you.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Meta i={all.resend} />
            <TestButton provider="resend" />
          </CardContent>
        </Card>
      </div>
      <p className="mt-6 text-sm text-muted-foreground">Feature flags live in <Link className="underline" href="/dashboard/settings">Settings</Link>. Turning a flag off always falls back to Manual mode; stored tokens stay until you disconnect.</p>
    </>
  );
}
