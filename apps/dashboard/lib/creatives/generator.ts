import "server-only";
import { readSecret } from "@/lib/integrations/store";
import { baseUrl, httpJson } from "@/lib/integrations/http";

/**
 * Image/video variant generation behind one interface, so the provider can be swapped.
 * Higgsfield API (docs.higgsfield.ai, read Nov 2026): https://api.higgsfield.ai, header
 * `Authorization: Key <key_id>:<key_secret>`, async requests (POST /<model> → request_id + status_url;
 * terminal statuses completed | failed | nsfw | canceled; output in images[].url or video.url).
 * Input media is uploaded first via POST /files/generate-upload-url → PUT upload_url → use public_url.
 */
export type GenerationFormat = "1:1" | "4:5" | "9:16";
export type GenerationStatus = { status: "queued" | "in_progress" | "completed" | "failed" | "nsfw" | "canceled"; urls: string[]; kind: "image" | "video" | null; error: string | null };

export interface CreativeGenerator {
  readonly name: string;
  /** Model path used for this submission (stored with the generation). */
  model(kind: "image" | "video"): string | null;
  submit(input: { image: { bytes: Buffer; contentType: string }; prompt: string; format: GenerationFormat; kind: "image" | "video" }): Promise<{ requestId: string }>;
  status(requestId: string): Promise<GenerationStatus>;
}

const HF = () => baseUrl("HIGGSFIELD_BASE_URL", "https://api.higgsfield.ai");

async function hfKey() {
  const k = process.env.HIGGSFIELD_API_KEY || (await readSecret("higgsfield"));
  if (!k || !k.includes(":")) throw new Error("Higgsfield needs an API key in the form KEY_ID:KEY_SECRET (env HIGGSFIELD_API_KEY or Integrations page).");
  return k;
}

const describe = (b: unknown, status: number) => {
  const e = b as { detail?: unknown; message?: string; error?: string };
  const d = typeof e?.detail === "string" ? e.detail : e?.message ?? e?.error;
  return d ? `${d} (HTTP ${status})` : `HTTP ${status}`;
};

async function hf<T>(path: string, init: RequestInit = {}) {
  const key = await hfKey();
  return httpJson<T>("Higgsfield", path.startsWith("http") ? path : `${HF()}${path}`, { ...init, headers: { Authorization: `Key ${key}`, "Content-Type": "application/json", Accept: "application/json", ...(init.headers as Record<string, string>) } }, describe);
}

export function higgsfieldGenerator(config: { imageModel?: string | null; videoModel?: string | null; extraParams?: Record<string, unknown> }): CreativeGenerator {
  return {
    name: "higgsfield",
    model: (kind) => (kind === "video" ? config.videoModel || "higgsfield-ai/dop/standard" : config.imageModel || null),
    async submit({ image, prompt, format, kind }) {
      const model = this.model(kind);
      if (!model) throw new Error("No Higgsfield image model set. Pick one at console.higgsfield.ai and paste its path on the Integrations page.");
      const up = await hf<{ public_url: string; upload_url: string; upload_headers?: Record<string, string> }>("/files/generate-upload-url", { method: "POST", body: JSON.stringify({ content_type: image.contentType }) });
      const put = await fetch(up.upload_url, { method: "PUT", headers: up.upload_headers ?? { "Content-Type": image.contentType }, body: new Uint8Array(image.bytes), signal: AbortSignal.timeout(60_000) });
      if (!put.ok) throw new Error(`Higgsfield upload failed (HTTP ${put.status})`);
      const body = { image_url: up.public_url, prompt, aspect_ratio: format, ...(config.extraParams ?? {}) };
      const r = await hf<{ request_id: string }>(`/${model.replace(/^\//, "")}`, { method: "POST", body: JSON.stringify(body) });
      if (!r.request_id) throw new Error("Higgsfield didn't return a request id.");
      return { requestId: r.request_id };
    },
    async status(requestId) {
      const r = await hf<{ status: GenerationStatus["status"]; images?: { url: string }[]; video?: { url: string }; error?: string }>(`/requests/${encodeURIComponent(requestId)}/status`);
      const urls = r.images?.map((i) => i.url) ?? (r.video?.url ? [r.video.url] : []);
      return { status: r.status, urls, kind: r.video?.url ? "video" : r.images?.length ? "image" : null, error: r.error ?? null };
    },
  };
}

/** Test button: an unknown request id should come back 404 with a valid key, 401/403 with a bad one. */
export async function testHiggsfield() {
  try {
    await hf(`/requests/00000000-0000-4000-8000-000000000000/status`);
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 404 || status === 422) return { label: "API key accepted" };
    throw e;
  }
  return { label: "API key accepted" };
}
