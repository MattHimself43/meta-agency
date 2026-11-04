import "server-only";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { withDefaultFlags } from "@/lib/flags";
import type { FeatureFlags } from "@/lib/db/schema";

export type Settings = typeof schema.settings.$inferSelect;

export const getSettings = cache(async (): Promise<Settings> => {
  const [row] = await db.select().from(schema.settings).where(eq(schema.settings.id, 1)).limit(1);
  if (row) return { ...row, featureFlags: withDefaultFlags(row.featureFlags) };
  const [created] = await db.insert(schema.settings).values({ id: 1 }).onConflictDoNothing().returning();
  if (created) return created;
  const [again] = await db.select().from(schema.settings).where(eq(schema.settings.id, 1)).limit(1);
  return again!;
});

export async function isEnabled(flag: keyof FeatureFlags): Promise<boolean> {
  const s = await getSettings();
  return Boolean(s.featureFlags[flag]);
}
