import { Suspense } from "react";
import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <AuthShell title="Sign in" subtitle="Owner access. Two-factor is required.">
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
