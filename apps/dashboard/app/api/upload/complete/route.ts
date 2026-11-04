import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { objectExists } from "@/lib/storage";
import { parseTags, recordAsset, uploaderFor, ASSET_TYPES } from "@/lib/assets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const body = z.object({ portalToken: z.string().optional(), clientId: z.string().optional(), path: z.string().max(400), type: z.enum(ASSET_TYPES), contentType: z.string().max(100), tags: z.string().max(300).optional() });

/** After a direct upload: confirm the object exists in this client's folder, then record the asset. */
export async function POST(req: NextRequest) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const b = parsed.data;
  const who = await uploaderFor(b);
  if (!who) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  if (!b.path.startsWith(`clients/${who.clientId}/`) || b.path.includes("..")) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  if (!(await objectExists(b.path))) return NextResponse.json({ error: "Upload not found" }, { status: 404 });
  const asset = await recordAsset({ clientId: who.clientId, path: b.path, type: b.type, mimeType: b.contentType, tags: parseTags(b.tags), via: who.via, actorId: who.actorId });
  return NextResponse.json({ ok: true, asset: { id: asset.id } });
}
