import { NextResponse, type NextRequest } from "next/server";
import { currentActor } from "@/lib/auth";
import { safeEqual } from "@/lib/crypto";
import { exchangeCode } from "@/lib/google";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const back = (q: string) => {
    const res = NextResponse.redirect(new URL(`/dashboard/integrations?${q}`, req.url));
    res.cookies.delete({ name: "g_oauth_state", path: "/api/integrations/google" });
    return res;
  };
  const actor = await currentActor();
  if (!actor || actor.role !== "owner") return NextResponse.redirect(new URL("/login", req.url));
  const p = req.nextUrl.searchParams;
  const state = p.get("state") ?? "";
  const cookie = req.cookies.get("g_oauth_state")?.value ?? "";
  if (!state || !cookie || !safeEqual(state, cookie)) return back(`error=${encodeURIComponent("Google sign-in expired or didn't match. Try Connect again.")}`);
  if (p.get("error")) return back(`error=${encodeURIComponent(`Google: ${p.get("error")}`)}`);
  const code = p.get("code");
  if (!code) return back(`error=${encodeURIComponent("Google didn't return a code.")}`);
  try {
    const { email } = await exchangeCode(code, actor.userId);
    return back(`ok=${encodeURIComponent(`Google connected${email ? ` as ${email}` : ""}`)}`);
  } catch (e) {
    return back(`error=${encodeURIComponent(e instanceof Error ? e.message : "Couldn't connect Google")}`);
  }
}
