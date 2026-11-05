import "server-only";
import { eq, sql } from "drizzle-orm";
import React from "react";
import { db, schema } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { formatAst } from "@/lib/time";
import { DOC_TABLE, DOC_LABEL } from "./generate";
import { TITLE_FIELD, type DocKind } from "./sections";

/** Everything needed to show or print one document. */
export async function loadDoc(kind: DocKind, id: string) {
  const table = DOC_TABLE[kind];
  const [row] = await db.select().from(table).where(eq(table.id, id));
  if (!row) return null;
  const [lead] = row.leadId ? await db.select().from(schema.leads).where(eq(schema.leads.id, row.leadId)) : [];
  const content = row.content as Record<string, unknown>;
  const slug = (content.package_slug ?? content.suggested_package_slug) as string | undefined;
  const [pkg] = slug ? await db.select().from(schema.packages).where(eq(schema.packages.slug, slug)) : [];
  const settings = await getSettings();
  const [{ waived }] = (await db.execute(sql`SELECT count(*)::int AS waived FROM clients WHERE setup_fee_waived`)) as unknown as [{ waived: number }];
  const setupWaived = settings.foundingOfferEnabled && waived < settings.foundingOfferSlots;
  const titleField = TITLE_FIELD[kind];
  const title = (titleField && (content[titleField] as string)) || `${DOC_LABEL[kind]} — ${lead?.businessName ?? ""}`;
  return { row, lead: lead ?? null, content, pkg: pkg ?? null, setupWaived, title, subtitle: `Prepared for ${lead?.businessName ?? "you"} · ${formatAst(row.createdAt, "d MMMM yyyy")}`, agencyName: settings.agencyName };
}

export async function renderDocPdf(kind: DocKind, id: string) {
  const d = await loadDoc(kind, id);
  if (!d) return null;
  const { renderToBuffer } = await import("@react-pdf/renderer");
  const { DocPdf } = await import("@/lib/pdf/doc-pdf");
  const buf = await renderToBuffer(
    React.createElement(DocPdf, { kind, content: d.content, title: d.title, subtitle: d.subtitle, agencyName: d.agencyName, pkg: d.pkg, setupWaived: d.setupWaived }) as Parameters<typeof renderToBuffer>[0],
  );
  return { buf, filename: `${DOC_LABEL[kind].toLowerCase().replace(/\s+/g, "-")}-${(d.lead?.businessName ?? "doc").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}.pdf` };
}
