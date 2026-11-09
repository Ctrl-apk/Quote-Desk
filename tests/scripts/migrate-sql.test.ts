import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checksumOf, listMigrations, pendingMigrations } from "../../scripts/migrate-sql";

function tmpMigrations(files: Record<string, string>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mig-"));
  for (const [name, sql] of Object.entries(files)) {
    fs.mkdirSync(path.join(dir, name));
    fs.writeFileSync(path.join(dir, name, "migration.sql"), sql);
  }
  fs.writeFileSync(path.join(dir, "migration_lock.toml"), "provider = \"postgresql\"\n");
  return dir;
}

describe("migration listing", () => {
  it("reads folders in name order and ignores loose files", () => {
    const dir = tmpMigrations({ "20260102_b": "SELECT 2;", "20260101_a": "SELECT 1;" });
    expect(listMigrations(dir).map((m) => m.name)).toEqual(["20260101_a", "20260102_b"]);
  });
  it("uses SHA-256 hex checksums like Prisma", () => {
    expect(checksumOf("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
  it("the repository's own migrations are all readable", () => {
    expect(listMigrations(path.join(process.cwd(), "prisma", "migrations")).length).toBeGreaterThanOrEqual(2);
  });
});

describe("pendingMigrations", () => {
  const all = [
    { name: "a", sql: "1", checksum: "ca" },
    { name: "b", sql: "2", checksum: "cb" },
  ];
  it("returns everything on an empty database", () => expect(pendingMigrations(all, []).map((m) => m.name)).toEqual(["a", "b"]));
  it("skips what is applied", () => expect(pendingMigrations(all, [{ migration_name: "a", checksum: "ca" }]).map((m) => m.name)).toEqual(["b"]));
  it("refuses an applied migration whose file changed", () => {
    expect(() => pendingMigrations(all, [{ migration_name: "a", checksum: "different" }])).toThrow(/edited after it was applied/);
  });
});
