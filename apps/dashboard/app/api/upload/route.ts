import { NextResponse, type NextRequest } from "next/server";
import { ALLOWED_TYPES, putObject, SERVER_UPLOAD_LIMIT } from "@/lib/storage";
import { assetPath, guessType, parseTags, recordAsset, uploaderFor } from "@/lib/assets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Small files (≤ 4 MB) through the server. Bigger files use /api/upload/sign → direct upload → /api/upload/complete. */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const who = await uploaderFor({ portalToken: form.get("portalToken") as string | null, clientId: form.get("clientId") as string | null });
  if (!who) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file" }, { status: 400 });
  if (!ALLOWED_TYPES.test(file.type)) return NextResponse.json({ error: `File type not allowed (${file.type || "unknown"})` }, { status: 415 });
  if (file.size > SERVER_UPLOAD_LIMIT) return NextResponse.json({ error: "File too large for direct upload" }, { status: 413 });
  const type = guessType(file.type, form.get("type") as string | null);
  const path = assetPath(who.clientId, type, file.name);
  try {
    await putObject(path, new Uint8Array(await file.arrayBuffer()), file.type);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Upload failed" }, { status: 500 });
  }
  const asset = await recordAsset({ clientId: who.clientId, path, type, mimeType: file.type, tags: parseTags(form.get("tags")), via: who.via, actorId: who.actorId });
  return NextResponse.json({ ok: true, asset: { id: asset.id, type: asset.type } });
}
