import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { AuthError, requireOwner } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { EXPORTABLE_TABLES, toCsv } from "@/lib/export";
import { astDateString } from "@/lib/time";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ table: string }> }) {
  let actor;
  try {
    actor = await requireOwner();
  } catch (e) {
    return NextResponse.json({ error: "forbidden" }, { status: e instanceof AuthError ? e.status : 403 });
  }
  const { table } = await params;
  if (!(EXPORTABLE_TABLES as readonly string[]).includes(table)) return NextResponse.json({ error: "unknown table" }, { status: 404 });
  // Table name is from the allowlist above, so identifier interpolation is safe.
  const rows = (await db.execute(sql.raw(`SELECT * FROM public."${table}"`))) as unknown as Record<string, unknown>[];
  await logAudit({ actorType: "user", actorId: actor.userId, action: "export.csv", entityTable: table, details: { rows: rows.length } });
  return new NextResponse(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${table}-${astDateString()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
