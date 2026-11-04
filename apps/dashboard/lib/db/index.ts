import "server-only";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

type Database = PostgresJsDatabase<typeof schema>;

declare global {
  // eslint-disable-next-line no-var
  var __agencyosDb: Database | undefined;
}

function instance(): Database {
  if (!globalThis.__agencyosDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    // prepare:false keeps us compatible with Supabase's transaction pooler (port 6543).
    const client = postgres(url, { max: 5, prepare: false, idle_timeout: 20, onnotice: () => {} });
    globalThis.__agencyosDb = drizzle(client, { schema });
  }
  return globalThis.__agencyosDb;
}

/** Lazily connected so `next build` doesn't need DATABASE_URL. */
export const db = new Proxy({} as Database, {
  get(_t, prop) {
    const real = instance();
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export type DB = Database;
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
export { schema };
