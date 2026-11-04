/** Apply SQL migrations in ./drizzle to DATABASE_URL. */
import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
  console.log("Migrations applied.");
  await sql.end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
