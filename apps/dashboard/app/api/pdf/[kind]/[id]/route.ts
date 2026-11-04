import { NextResponse } from "next/server";
import { AuthError, requireStaff } from "@/lib/auth";
import { renderDocPdf } from "@/lib/docs/load";
import type { DocKind } from "@/lib/docs/sections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  try {
    await requireStaff();
  } catch (e) {
    return NextResponse.json({ error: "forbidden" }, { status: e instanceof AuthError ? e.status : 403 });
  }
  const { kind, id } = await params;
  if (!["audit", "call_brief", "proposal"].includes(kind) || !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const pdf = await renderDocPdf(kind as DocKind, id);
  if (!pdf) return NextResponse.json({ error: "not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(pdf.buf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${pdf.filename}"`, "Cache-Control": "private, no-store" } });
}
