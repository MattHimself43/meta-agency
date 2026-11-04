import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { isEnabled } from "@/lib/settings";
import { enqueueJob } from "@/lib/jobs";
import { getIntegration } from "@/lib/integrations/store";
import { putObject, readBytes } from "@/lib/storage";
import { assetPath, recordAsset } from "@/lib/assets";
import { higgsfieldGenerator, type CreativeGenerator, type GenerationFormat } from "./generator";

const MAX_POLLS = 40; // ~40 minutes at one poll a minute

export async function generator(): Promise<CreativeGenerator | null> {
  if (!(await isEnabled("higgsfield"))) return null;
  const cfg = (await getIntegration("higgsfield")).config;
  return higgsfieldGenerator({ imageModel: (cfg.imageModel as string) || process.env.HIGGSFIELD_IMAGE_MODEL || null, videoModel: (cfg.videoModel as string) || process.env.HIGGSFIELD_VIDEO_MODEL || null, extraParams: (cfg.extraParams as Record<string, unknown>) ?? {} });
}

/** Default prompt: keep the client's real product, change only framing/motion — never invent offers or prices. */
export function defaultPrompt(kind: "image" | "video", format: GenerationFormat, tags: string[]) {
  const subject = tags.filter((t) => !["photo", "generated"].includes(t)).join(", ") || "the product in the photo";
  return kind === "video"
    ? `Subtle, realistic camera move around ${subject}. Keep the exact vehicle/property, colours and background details. No text, no logos, no people added. Framed for ${format}.`
    : `Clean ad-ready version of this photo of ${subject} for a ${format} placement. Keep the exact product, colours and details. No added text, prices or logos.`;
}

/** Staff starts a variant from one of the client's own photos. Polling runs as a job. */
export async function startGeneration(input: { assetId: string; format: GenerationFormat; kind: "image" | "video"; prompt?: string | null; actorId: string }) {
  const gen = await generator();
  if (!gen) throw new Error("Higgsfield is off. Turn the flag on in Settings and add the API key on the Integrations page.");
  const [asset] = await db.select().from(schema.assets).where(eq(schema.assets.id, input.assetId));
  if (!asset) throw new Error("Asset not found");
  if (!asset.mimeType?.startsWith("image/")) throw new Error("Pick a photo to generate from.");
  const bytes = await readBytes(asset.filePath);
  if (!bytes) throw new Error("Couldn't read that photo.");
  const prompt = (input.prompt?.trim() || defaultPrompt(input.kind, input.format, asset.tags as string[])).slice(0, 2000);
  const model = gen.model(input.kind) ?? "unset";
  const [row] = await db.insert(schema.creativeGenerations).values({ clientId: asset.clientId, sourceAssetId: asset.id, provider: gen.name, model, format: input.format, prompt, createdBy: input.actorId }).returning();
  try {
    const { requestId } = await gen.submit({ image: { bytes, contentType: asset.mimeType }, prompt, format: input.format, kind: input.kind });
    await db.update(schema.creativeGenerations).set({ requestId, status: "queued" }).where(eq(schema.creativeGenerations.id, row!.id));
    await enqueueJob("creative_generation_poll", { generationId: row!.id }, { dedupeKey: `hf_poll:${row!.id}:0`, runAfter: new Date(Date.now() + 30_000) });
  } catch (e) {
    await db.update(schema.creativeGenerations).set({ status: "error", error: e instanceof Error ? e.message : String(e) }).where(eq(schema.creativeGenerations.id, row!.id));
    throw e;
  }
  await logAudit({ actorType: "user", actorId: input.actorId, action: "creative.generation_started", entityTable: "creative_generations", entityId: row!.id, details: { provider: gen.name, model, format: input.format } });
  return row!;
}

/** Job: check once; save outputs as assets when done, otherwise poll again in a minute. */
export async function pollGeneration(generationId: string) {
  const [row] = await db.select().from(schema.creativeGenerations).where(eq(schema.creativeGenerations.id, generationId));
  if (!row?.requestId || ["completed", "failed", "nsfw", "canceled", "error"].includes(row.status)) return { done: true };
  const gen = await generator();
  if (!gen) return { done: true, reason: "flag off" };
  const s = await gen.status(row.requestId);
  const polls = row.polls + 1;
  if (s.status === "completed") {
    const ids: string[] = [];
    for (const [n, url] of s.urls.entries()) {
      const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (!res.ok) continue;
      const type = res.headers.get("content-type")?.split(";")[0] || (s.kind === "video" ? "video/mp4" : "image/jpeg");
      const ext = type.includes("mp4") ? "mp4" : type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg";
      const path = assetPath(row.clientId, "creative", `generated-${row.format.replace(":", "x")}-${n + 1}.${ext}`);
      await putObject(path, new Uint8Array(await res.arrayBuffer()), type);
      const asset = await recordAsset({ clientId: row.clientId, path, type: "creative", mimeType: type, tags: ["generated", row.provider, row.format], via: "dashboard", actorId: row.createdBy });
      ids.push(asset.id);
    }
    await db.update(schema.creativeGenerations).set({ status: "completed", outputAssetIds: ids, polls }).where(eq(schema.creativeGenerations.id, generationId));
    return { done: true, saved: ids.length };
  }
  if (s.status === "failed" || s.status === "nsfw" || s.status === "canceled") {
    await db.update(schema.creativeGenerations).set({ status: s.status, error: s.error ?? (s.status === "nsfw" ? "Rejected by Higgsfield's content check." : null), polls }).where(eq(schema.creativeGenerations.id, generationId));
    return { done: true, status: s.status };
  }
  if (polls >= MAX_POLLS) {
    await db.update(schema.creativeGenerations).set({ status: "error", error: "Timed out waiting for Higgsfield.", polls }).where(eq(schema.creativeGenerations.id, generationId));
    return { done: true, status: "timeout" };
  }
  await db.update(schema.creativeGenerations).set({ status: s.status, polls }).where(and(eq(schema.creativeGenerations.id, generationId)));
  await enqueueJob("creative_generation_poll", { generationId }, { dedupeKey: `hf_poll:${generationId}:${polls}`, runAfter: new Date(Date.now() + 60_000) });
  return { done: false, status: s.status, polls };
}

export async function generationsFor(clientId: string) {
  return db.select().from(schema.creativeGenerations).where(eq(schema.creativeGenerations.clientId, clientId)).orderBy(schema.creativeGenerations.createdAt);
}
