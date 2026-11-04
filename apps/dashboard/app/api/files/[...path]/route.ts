import { NextResponse, type NextRequest } from "next/server";
import { currentActor } from "@/lib/auth";
import { resolvePortal } from "@/lib/portal";
import { readObject } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Private file access. Staff see everything; a portal token only sees its own client's folder. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const path = (await params).path.join("/");
  if (path.includes("..")) return NextResponse.json({ error: "not found" }, { status: 404 });
  const token = req.nextUrl.searchParams.get("t");
  let allowed = false;
  if (token) {
    const r = await resolvePortal(token);
    allowed = r.status === "ok" && path.startsWith(`clients/${r.client.id}/`);
  } else {
    const actor = await currentActor();
    allowed = Boolean(actor && actor.role !== "none");
  }
  if (!allowed) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const obj = await readObject(path);
  if (!obj) return NextResponse.json({ error: "not found" }, { status: 404 });
  if ("redirect" in obj) return NextResponse.redirect(obj.redirect, 302);
  return new NextResponse(new Uint8Array(obj.bytes), { headers: { "Content-Type": obj.contentType, "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" } });
}
