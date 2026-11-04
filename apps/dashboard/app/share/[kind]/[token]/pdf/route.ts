import { NextResponse } from "next/server";
import { resolveShare } from "@/lib/share";
import { renderDocPdf } from "@/lib/docs/load";
import type { DocKind } from "@/lib/docs/sections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ kind: string; token: string }> }) {
  const { kind, token } = await params;
  const r = await resolveShare(kind, token);
  if (r.status === "rate_limited") return NextResponse.json({ error: "rate limited" }, { status: 429 });
  if (r.status !== "ok") return NextResponse.json({ error: "not found" }, { status: 404 });
  const pdf = await renderDocPdf(kind as DocKind, r.row.id);
  if (!pdf) return NextResponse.json({ error: "not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(pdf.buf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${pdf.filename}"`, "Cache-Control": "private, no-store" } });
}
