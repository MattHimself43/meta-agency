"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";

type State =
  | { kind: "loading" }
  | { kind: "enroll"; factorId: string; qr: string; secret: string }
  | { kind: "verify"; factorId: string };

/**
 * Two-factor (TOTP) via Supabase Auth MFA.
 * First sign-in: enrol an authenticator app (QR code). After that: verify a code each session.
 * A verified session has aal2, which middleware and RLS both require.
 */
export function MfaForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const supabase = supabaseBrowser();
    (async () => {
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.currentLevel === "aal2") return done();
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) return setError(error.message);
      const verified = data.totp.find((f) => f.status === "verified");
      if (verified) return setState({ kind: "verify", factorId: verified.id });
      // Clean up abandoned enrolments, then start a fresh one.
      for (const f of data.all.filter((f) => f.factor_type === "totp" && f.status !== "verified")) {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data: enrolled, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "AgencyOS" });
      if (enrollError) return setError(enrollError.message);
      setState({ kind: "enroll", factorId: enrolled.id, qr: enrolled.totp.qr_code, secret: enrolled.totp.secret });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function done() {
    const next = params.get("next");
    router.replace(next && next.startsWith("/dashboard") ? next : "/dashboard");
    router.refresh();
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (state.kind === "loading") return;
    setBusy(true);
    setError(null);
    const code = String(new FormData(e.currentTarget).get("code")).replace(/\s/g, "");
    const { error } = await supabaseBrowser().auth.mfa.challengeAndVerify({ factorId: state.factorId, code });
    setBusy(false);
    if (error) return setError(error.message);
    done();
  }

  if (state.kind === "loading") return <p className="text-sm text-muted-foreground">{error ?? "Loading…"}</p>;

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {state.kind === "enroll" ? (
        <div className="space-y-3">
          <p className="text-sm">Scan this QR code with Google Authenticator, 1Password, Authy or similar.</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={state.qr} alt="Authenticator QR code" className="mx-auto h-44 w-44 rounded border bg-white p-2" />
          <p className="break-all text-center font-mono text-xs text-muted-foreground">{state.secret}</p>
        </div>
      ) : null}
      <Field label="6-digit code">
        <Input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required autoFocus />
      </Field>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Checking…" : state.kind === "enroll" ? "Turn on two-factor" : "Verify"}
      </Button>
    </form>
  );
}
