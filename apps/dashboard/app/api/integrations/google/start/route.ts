import { NextResponse } from "next/server";
import { currentActor } from "@/lib/auth";
import { generateToken } from "@/lib/crypto";
import { authUrl } from "@/lib/google";

export const dynamic = "force-dynamic";

/** Owner-only: start Google OAuth. `state` is bound to an httpOnly cookie to stop CSRF on the callback. */
export async function GET(req: Request) {
  const actor = await currentActor();
  if (!actor || actor.role !== "owner") return NextResponse.redirect(new URL("/login", req.url));
  let url: string;
  const state = generateToken();
  try {
    url = authUrl(state);
  } catch (e) {
    return NextResponse.redirect(new URL(`/dashboard/integrations?error=${encodeURIComponent(e instanceof Error ? e.message : "Google isn't configured")}`, req.url));
  }
  const res = NextResponse.redirect(url);
  res.cookies.set("g_oauth_state", state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/integrations/google", maxAge: 600 });
  return res;
}
