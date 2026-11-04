"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Upload, X } from "lucide-react";
import { Input } from "@/components/ui/input";

const SERVER_LIMIT = 4 * 1024 * 1024;
type Item = { name: string; state: "uploading" | "done" | "error"; message?: string };

/**
 * Multi-file uploader for the portal and the dashboard. Files up to 4 MB go through /api/upload;
 * bigger ones (videos) get a signed URL and upload straight to Supabase Storage.
 */
export function Uploader({ portalToken, clientId, type, accept = "image/*,video/*", tagsField = true, label = "Choose photos or videos" }: { portalToken?: string; clientId?: string; type?: string; accept?: string; tagsField?: boolean; label?: string }) {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const tags = useRef<HTMLInputElement>(null);

  async function uploadOne(file: File): Promise<string | null> {
    const auth = portalToken ? { portalToken } : { clientId };
    if (file.size <= SERVER_LIMIT) {
      const fd = new FormData();
      fd.set("file", file);
      if (portalToken) fd.set("portalToken", portalToken);
      if (clientId) fd.set("clientId", clientId);
      if (type) fd.set("type", type);
      fd.set("tags", tags.current?.value ?? "");
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      return res.ok ? null : ((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Upload failed";
    }
    const sign = await fetch("/api/upload/sign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...auth, filename: file.name, contentType: file.type, size: file.size, type }) });
    const s = (await sign.json().catch(() => ({}))) as { url?: string; path?: string; type?: string; error?: string };
    if (!sign.ok || !s.url) return s.error ?? "Upload failed";
    const put = await fetch(s.url, { method: "PUT", headers: { "Content-Type": file.type, "x-upsert": "true" }, body: file });
    if (!put.ok) return "Upload failed — try again";
    const done = await fetch("/api/upload/complete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...auth, path: s.path, type: s.type, contentType: file.type, tags: tags.current?.value ?? "" }) });
    return done.ok ? null : "Upload failed — try again";
  }

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    const list = [...files].slice(0, 20);
    setItems((x) => [...x, ...list.map((f) => ({ name: f.name, state: "uploading" as const }))]);
    for (const f of list) {
      const problem = await uploadOne(f).catch(() => "Upload failed — check your connection");
      setItems((x) => x.map((i) => (i.name === f.name && i.state === "uploading" ? { ...i, state: problem ? "error" : "done", message: problem ?? undefined } : i)));
    }
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {tagsField ? <Input ref={tags} placeholder="Tags (optional): e.g. tiida, lot, team" /> : null}
      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[22px] border border-dashed border-[var(--line-strong)] bg-[rgba(12,22,46,0.35)] px-4 py-8 text-center transition-colors hover:border-brand-cyan/60">
        <Upload className="h-6 w-6 text-brand-cyan" />
        <span className="font-semibold">{label}</span>
        <span className="text-xs text-muted-foreground">JPG, PNG, HEIC, MP4 or MOV · up to 20 at a time</span>
        <input type="file" multiple accept={accept} className="sr-only" onChange={(e) => onFiles(e.target.files)} />
      </label>
      {items.length ? (
        <ul className="space-y-1.5 text-sm">
          {items.map((i, n) => (
            <li key={n} className="flex items-center gap-2">
              {i.state === "uploading" ? <Loader2 className="h-4 w-4 animate-spin text-brand-cyan" /> : i.state === "done" ? <Check className="h-4 w-4 text-[#7cf5c4]" /> : <X className="h-4 w-4 text-red-300" />}
              <span className="truncate">{i.name}</span>
              {i.message ? <span className="text-xs text-red-300">{i.message}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
