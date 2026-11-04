import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Only auth-relevant routes. Public routes (/portal, /book, /share, /api/cron, /api/webhooks) skip this.
  matcher: ["/dashboard/:path*", "/mfa", "/login"],
};
