import { Suspense } from "react";
import { AuthShell } from "@/components/auth-shell";
import { MfaForm } from "./mfa-form";

export const metadata = { title: "Two-factor" };

export default function MfaPage() {
  return (
    <AuthShell title="Two-factor authentication" subtitle="Enter the 6-digit code from your authenticator app.">
      <Suspense>
        <MfaForm />
      </Suspense>
    </AuthShell>
  );
}
