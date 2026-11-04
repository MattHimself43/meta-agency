import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Refreshes the Supabase session cookie and enforces:
 *   /dashboard/**  -> signed in AND two-factor verified (aal2)
 *   /mfa           -> signed in
 * Role checks (owner vs account manager) happen server-side in lib/auth.ts.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const path = request.nextUrl.pathname;

  const redirect = (to: string) => {
    const url = request.nextUrl.clone();
    url.pathname = to;
    url.search = to === "/login" ? `?next=${encodeURIComponent(path)}` : "";
    const r = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => r.cookies.set(c));
    return r;
  };

  if (path.startsWith("/dashboard")) {
    if (!claims) return redirect("/login");
    if (claims.aal !== "aal2") return redirect("/mfa");
  }
  if (path.startsWith("/mfa") && !claims) return redirect("/login");

  return response;
}
