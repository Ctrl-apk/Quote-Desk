import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export interface MigrationFile {
  name: string;
  sql: string;
  checksum: string;
}

/** Prisma records the SHA-256 of each migration.sql; matching it keeps `prisma migrate deploy` happy later. */
export const checksumOf = (sql: string) => createHash("sha256").update(sql).digest("hex");

/** Migration folders in name order (they start with a timestamp), each with its SQL and checksum. */
export function listMigrations(dir: string): MigrationFile[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
    .map((name) => {
      const sql = fs.readFileSync(path.join(dir, name, "migration.sql"), "utf8");
      return { name, sql, checksum: checksumOf(sql) };
    });
}

export const MIGRATIONS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
  "id" VARCHAR(36) PRIMARY KEY NOT NULL,
  "checksum" VARCHAR(64) NOT NULL,
  "finished_at" TIMESTAMPTZ,
  "migration_name" VARCHAR(255) NOT NULL,
  "logs" TEXT,
  "rolled_back_at" TIMESTAMPTZ,
  "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "applied_steps_count" INTEGER NOT NULL DEFAULT 0
)`;

export const newMigrationId = () => randomUUID();

/** Which migrations still need applying; a changed checksum on an applied one is an error, never silently skipped. */
export function pendingMigrations(all: MigrationFile[], applied: { migration_name: string; checksum: string }[]): MigrationFile[] {
  const byName = new Map(applied.map((a) => [a.migration_name, a.checksum]));
  for (const m of all) {
    const done = byName.get(m.name);
    if (done !== undefined && done !== m.checksum) throw new Error(`Migration ${m.name} was edited after it was applied. Add a new migration instead.`);
  }
  return all.filter((m) => !byName.has(m.name));
}
