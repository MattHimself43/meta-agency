import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ALLOWED_TYPES, MAX_UPLOAD, signedUploadUrl, storageMode } from "@/lib/storage";
import { assetPath, guessType, uploaderFor } from "@/lib/assets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const body = z.object({ portalToken: z.string().optional(), clientId: z.string().optional(), filename: z.string().max(200), contentType: z.string().max(100), size: z.number().int().positive(), type: z.string().optional() });

/** Returns a short-lived signed URL so the browser can upload large files straight to Supabase Storage. */
export async function POST(req: NextRequest) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const b = parsed.data;
  const who = await uploaderFor(b);
  if (!who) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  if (!ALLOWED_TYPES.test(b.contentType)) return NextResponse.json({ error: "File type not allowed" }, { status: 415 });
  if (b.size > MAX_UPLOAD) return NextResponse.json({ error: "File too large (max 200 MB)" }, { status: 413 });
  if (storageMode() !== "supabase") return NextResponse.json({ error: "Large uploads need Supabase Storage (SUPABASE_SERVICE_ROLE_KEY). Files up to 4 MB still work." }, { status: 501 });
  const type = guessType(b.contentType, b.type);
  const path = assetPath(who.clientId, type, b.filename);
  const signed = await signedUploadUrl(path);
  return NextResponse.json({ path, type, url: signed!.url });
}
