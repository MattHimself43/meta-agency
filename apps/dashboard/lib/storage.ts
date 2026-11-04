import "server-only";
import { createClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

/**
 * File storage with two drivers:
 *  - "supabase": private bucket in Supabase Storage (needs SUPABASE_SERVICE_ROLE_KEY). Browsers upload straight to
 *    Storage with a short-lived signed URL, so large photos and videos never pass through a Vercel function.
 *  - "database": base64 in the stored_files table. For local dev/tests; capped at SERVER_UPLOAD_LIMIT.
 * Downloads always go through /api/files/<path>, which checks access and then redirects to a signed URL or streams.
 */
export const BUCKET = process.env.STORAGE_BUCKET ?? "agencyos";
/** Vercel functions accept request bodies up to ~4.5 MB. */
export const SERVER_UPLOAD_LIMIT = 4 * 1024 * 1024;
export const MAX_UPLOAD = 200 * 1024 * 1024;

export const ALLOWED_TYPES = /^(image\/(jpeg|png|webp|gif|heic|heif)|video\/(mp4|quicktime|webm)|application\/pdf|text\/csv|application\/vnd\.ms-excel|application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet)$/;

export function storageMode(): "supabase" | "database" {
  return process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL ? "supabase" : "database";
}

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}

export function safeName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-+|-+$/g, "").slice(-80) || "file";
}

export async function putObject(path: string, bytes: Uint8Array, contentType: string) {
  if (storageMode() === "supabase") {
    const { error } = await admin().storage.from(BUCKET).upload(path, bytes, { contentType, upsert: true });
    if (error) throw new Error(`Upload failed: ${error.message}`);
    return;
  }
  if (bytes.byteLength > SERVER_UPLOAD_LIMIT) throw new Error("File too large for database storage — connect Supabase Storage (see README).");
  await db
    .insert(schema.storedFiles)
    .values({ path, contentType, size: bytes.byteLength, data: Buffer.from(bytes).toString("base64") })
    .onConflictDoUpdate({ target: schema.storedFiles.path, set: { contentType, size: bytes.byteLength, data: Buffer.from(bytes).toString("base64") } });
}

/** Signed URL the browser can PUT to directly (supabase driver only). */
export async function signedUploadUrl(path: string) {
  if (storageMode() !== "supabase") return null;
  const { data, error } = await admin().storage.from(BUCKET).createSignedUploadUrl(path);
  if (error) throw new Error(error.message);
  return { url: data.signedUrl, token: data.token };
}

export async function objectExists(path: string) {
  if (storageMode() === "supabase") {
    const dir = path.split("/").slice(0, -1).join("/");
    const name = path.split("/").at(-1)!;
    const { data } = await admin().storage.from(BUCKET).list(dir, { search: name, limit: 1 });
    return Boolean(data?.some((f) => f.name === name));
  }
  const [row] = await db.select({ path: schema.storedFiles.path }).from(schema.storedFiles).where(eq(schema.storedFiles.path, path));
  return Boolean(row);
}

/** For the supabase driver: a 5-minute signed download URL. For the database driver: the bytes. */
export async function readObject(path: string): Promise<{ redirect: string } | { bytes: Buffer; contentType: string } | null> {
  if (storageMode() === "supabase") {
    const { data, error } = await admin().storage.from(BUCKET).createSignedUrl(path, 300);
    if (error || !data) return null;
    return { redirect: data.signedUrl };
  }
  const [row] = await db.select().from(schema.storedFiles).where(eq(schema.storedFiles.path, path));
  return row ? { bytes: Buffer.from(row.data, "base64"), contentType: row.contentType } : null;
}

export async function readBytes(path: string): Promise<Buffer | null> {
  const r = await readObject(path);
  if (!r) return null;
  if ("bytes" in r) return r.bytes;
  const res = await fetch(r.redirect);
  return res.ok ? Buffer.from(await res.arrayBuffer()) : null;
}
