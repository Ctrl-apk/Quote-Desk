/**
 * Applies the SQL migrations with the plain pg driver and records them in Prisma's own
 * _prisma_migrations table. Use it on a fresh database when `prisma migrate deploy` cannot
 * run (for example, a network that blocks Prisma's engine download). The records match what
 * Prisma writes, so `prisma migrate deploy` afterwards sees everything as already applied.
 */
import path from "node:path";
import pg from "pg";
import { MIGRATIONS_TABLE_SQL, listMigrations, newMigrationId, pendingMigrations } from "./migrate-sql";

async function main() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("Set DATABASE_URL (or DIRECT_URL) first.");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(MIGRATIONS_TABLE_SQL);
    const applied = (await client.query("SELECT migration_name, checksum FROM _prisma_migrations WHERE rolled_back_at IS NULL")).rows;
    const todo = pendingMigrations(listMigrations(path.join(process.cwd(), "prisma", "migrations")), applied);
    if (todo.length === 0) return console.log("Database is up to date.");
    for (const m of todo) {
      await client.query("BEGIN");
      try {
        await client.query(m.sql);
        await client.query(
          "INSERT INTO _prisma_migrations (id, checksum, migration_name, finished_at, applied_steps_count) VALUES ($1, $2, $3, now(), 1)",
          [newMigrationId(), m.checksum, m.name],
        );
        await client.query("COMMIT");
        console.log(`Applied ${m.name}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw new Error(`Migration ${m.name} failed: ${error instanceof Error ? error.message : "unknown error"}`);
      }
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
