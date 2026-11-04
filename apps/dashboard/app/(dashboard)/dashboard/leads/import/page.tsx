import Link from "next/link";
import { asc } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { db, schema } from "@/lib/db";
import { requireStaffPage } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { ImportForm } from "./import-form";

export const metadata = { title: "Import leads" };

export default async function ImportPage() {
  await requireStaffPage();
  const niches = await db.select({ id: schema.niches.id, name: schema.niches.name }).from(schema.niches).orderBy(asc(schema.niches.name));
  return (
    <>
      <Link href="/dashboard/leads" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-brand-cyan">
        <ArrowLeft className="h-4 w-4" /> Leads
      </Link>
      <PageHeader kicker="Sell" title="Import leads" description="Upload a CSV, match the columns, and import. Duplicates (same phone or Facebook page) are skipped." />
      <ImportForm niches={niches} />
    </>
  );
}
