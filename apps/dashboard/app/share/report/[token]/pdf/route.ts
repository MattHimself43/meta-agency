import { NextResponse, type NextRequest } from "next/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { findSharedReport, renderReportPdf } from "@/lib/reports/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{43,}$/.test(token)) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!(await rateLimit(`share:${clientIp(req.headers)}`, 60, 600)).ok) return NextResponse.json({ error: "rate limited" }, { status: 429 });
  const r = await findSharedReport(token);
  if (!r) return NextResponse.json({ error: "not found" }, { status: 404 });
  const pdf = await renderReportPdf(r.id);
  return new NextResponse(new Uint8Array(pdf!.buf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${pdf!.filename}"`, "Cache-Control": "private, no-store" } });
}
