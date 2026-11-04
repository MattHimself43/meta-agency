import { NextResponse } from "next/server";
import { AuthError, requireStaff } from "@/lib/auth";
import { renderReportPdf } from "@/lib/reports/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireStaff();
  } catch (e) {
    return NextResponse.json({ error: "forbidden" }, { status: e instanceof AuthError ? e.status : 403 });
  }
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const pdf = await renderReportPdf(id);
  if (!pdf) return NextResponse.json({ error: "not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(pdf.buf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${pdf.filename}"`, "Cache-Control": "private, no-store" } });
}
