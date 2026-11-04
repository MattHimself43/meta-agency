import { NextResponse, type NextRequest } from "next/server";
import { safeEqual } from "@/lib/crypto";
import { dispatchDueRoutines } from "@/lib/routines/runner";
import { processJobs } from "@/lib/jobs";
import { registerJobHandlers } from "@/lib/job-handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Called every 15 minutes, either by Vercel Cron (Pro; GET with "Authorization: Bearer $CRON_SECRET")
 * or by Supabase pg_cron + pg_net (Hobby; see supabase/cron.sql).
 */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : (req.headers.get("x-cron-secret") ?? "");
  if (!secret || !provided || !safeEqual(provided, secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  registerJobHandlers();
  const started = Date.now();
  const deadline = started + (maxDuration - 5) * 1000;
  const now = new Date();
  const routines = await dispatchDueRoutines(now, deadline);
  const jobs = await processJobs(deadline);
  return NextResponse.json({ ok: true, now: now.toISOString(), routines, jobs, ms: Date.now() - started });
}

export const GET = handle;
export const POST = handle;
