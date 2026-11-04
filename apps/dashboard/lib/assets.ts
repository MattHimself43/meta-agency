import "server-only";
import { randomUUID } from "node:crypto";
import { db, schema } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { currentActor } from "@/lib/auth";
import { resolvePortal } from "@/lib/portal";
import { safeName } from "@/lib/storage";

export const ASSET_TYPES = ["photo", "video", "logo", "stock_list", "creative", "other"] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

/** Who is uploading: a signed-in staff member (any client) or a portal visitor (only their own client). */
export async function uploaderFor(input: { portalToken?: string | null; clientId?: string | null }) {
  if (input.portalToken) {
    const r = await resolvePortal(input.portalToken);
    if (r.status !== "ok") return null;
    return { clientId: r.client.id, via: "portal" as const, actorId: null, isDemo: r.client.isDemo };
  }
  const actor = await currentActor();
  if (!actor || actor.role === "none" || !input.clientId || !/^[0-9a-f-]{36}$/i.test(input.clientId)) return null;
  return { clientId: input.clientId, via: "dashboard" as const, actorId: actor.userId, isDemo: false };
}

export function assetPath(clientId: string, type: string, filename: string) {
  return `clients/${clientId}/${type}/${randomUUID().slice(0, 8)}-${safeName(filename)}`;
}

export function guessType(contentType: string, requested?: string | null): AssetType {
  if (requested && (ASSET_TYPES as readonly string[]).includes(requested)) return requested as AssetType;
  if (contentType.startsWith("video/")) return "video";
  if (contentType.startsWith("image/")) return "photo";
  return "other";
}

export async function recordAsset(input: { clientId: string; path: string; type: AssetType; mimeType: string; tags: string[]; via: "portal" | "dashboard"; actorId: string | null }) {
  const [asset] = await db
    .insert(schema.assets)
    .values({ clientId: input.clientId, filePath: input.path, type: input.type, mimeType: input.mimeType, tags: input.tags, uploadedVia: input.via, createdBy: input.actorId })
    .returning();
  await logAudit({ actorType: input.via === "portal" ? "portal" : "user", actorId: input.actorId, action: "asset.uploaded", entityTable: "assets", entityId: asset!.id, details: { clientId: input.clientId, type: input.type } });
  return asset!;
}

export function parseTags(raw: unknown): string[] {
  return String(raw ?? "")
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 12);
}
