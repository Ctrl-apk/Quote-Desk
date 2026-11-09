import path from "node:path";
import pg from "pg";
import { MIGRATIONS_TABLE_SQL, listMigrations, newMigrationId } from "../../scripts/migrate-sql";

/**
 * Builds a clean database from the committed migrations before the integration tests.
 * It DROPS the public schema, so it refuses any database whose name does not contain "test".
 */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is not set. Integration tests need a throwaway Postgres database whose name contains \"test\", " +
        "for example postgresql://postgres:password@localhost:5432/quotedesk_test. They are not skipped silently.",
    );
  }
  const dbName = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
  if (!/test/i.test(dbName)) throw new Error(`Refusing to reset database "${dbName}": the name must contain "test".`);

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("DROP SCHEMA public CASCADE");
    await client.query("CREATE SCHEMA public");
    await client.query(MIGRATIONS_TABLE_SQL);
    for (const m of listMigrations(path.join(process.cwd(), "prisma", "migrations"))) {
      await client.query(m.sql);
      await client.query("INSERT INTO _prisma_migrations (id, checksum, migration_name, finished_at, applied_steps_count) VALUES ($1,$2,$3,now(),1)", [newMigrationId(), m.checksum, m.name]);
    }
  } finally {
    await client.end();
  }
}
