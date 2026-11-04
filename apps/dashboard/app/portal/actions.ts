"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePortal } from "@/lib/portal";
import { clientIp } from "@/lib/rate-limit";
import { saveBrand, saveIntake, saveMetaAccess, signAgreement } from "@/lib/clients/onboarding";
import { setCreativeStatus } from "@/lib/creatives/service";

const token = z.string().regex(/^[A-Za-z0-9_-]{43,}$/);
const err = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong — please try again.");
function back(t: string, path: string, params: Record<string, string>): never {
  redirect(`/portal/${t}${path}?${new URLSearchParams(params)}`);
}

export async function signAction(form: FormData) {
  const t = token.parse(form.get("token"));
  const client = await requirePortal(t);
  if (form.get("agree") !== "on") back(t, "/agreement", { error: "Tick the box to confirm you agree." });
  const h = await headers();
  try {
    await signAgreement(client.id, { name: String(form.get("name") ?? ""), signaturePng: String(form.get("signature") ?? ""), ip: clientIp(h) === "unknown" ? null : clientIp(h), userAgent: h.get("user-agent") });
  } catch (e) {
    back(t, "/agreement", { error: err(e) });
  }
  back(t, "", { done: "agreement" });
}

export async function intakeAction(form: FormData) {
  const t = token.parse(form.get("token"));
  const client = await requirePortal(t);
  const answers = Object.fromEntries([...form.entries()].filter(([k]) => k.startsWith("q:")).map(([k, v]) => [k.slice(2), String(v)]));
  let missing: string[] = [];
  try {
    missing = (await saveIntake(client.id, answers, { type: "portal", id: null }, { partial: true })).missing;
  } catch (e) {
    back(t, "/intake", { error: err(e) });
  }
  if (missing.length) back(t, "/intake", { error: `Saved — still needed: ${missing.join(", ")}` });
  back(t, "", { done: "intake" });
}

export async function brandAction(form: FormData) {
  const t = token.parse(form.get("token"));
  const client = await requirePortal(t);
  const colours = form.getAll("colour").map(String);
  try {
    await saveBrand(client.id, colours, { type: "portal", id: null }, form.get("finish") === "1");
  } catch (e) {
    back(t, "/assets", { error: err(e) });
  }
  if (form.get("finish") === "1") back(t, "", { done: "assets" });
  back(t, "/assets", { notice: "Colours saved" });
}

export async function metaAction(form: FormData) {
  const t = token.parse(form.get("token"));
  const client = await requirePortal(t);
  try {
    await saveMetaAccess(client.id, { adAccountId: String(form.get("adAccountId") ?? ""), pageUrl: String(form.get("pageUrl") ?? ""), instagram: String(form.get("instagram") ?? ""), businessId: String(form.get("businessId") ?? ""), partnerAccessGiven: form.get("partner") === "on", cardAdded: form.get("card") === "on" }, { type: "portal", id: null });
  } catch (e) {
    back(t, "/meta", { error: err(e) });
  }
  back(t, "", { done: "meta_access" });
}

export async function reviewAction(form: FormData) {
  const t = token.parse(form.get("token"));
  await requirePortal(t);
  const id = z.string().uuid().parse(form.get("id"));
  const decision = z.enum(["approved", "rejected"]).parse(form.get("decision"));
  const comment = String(form.get("comment") ?? "").trim().slice(0, 1000);
  if (decision === "rejected" && !comment) back(t, "/review", { error: "Tell us what to change." });
  try {
    await setCreativeStatus(id, decision, { type: "portal", id: null }, { comment: comment || undefined });
  } catch (e) {
    back(t, "/review", { error: err(e) });
  }
  back(t, "/review", { notice: decision === "approved" ? "Approved — thank you!" : "Thanks — we'll make the changes." });
}
