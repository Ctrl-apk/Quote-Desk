import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth";

const COST = 4; // minimum bcrypt cost keeps tests fast; production uses BCRYPT_COST

describe("password hashing", () => {
  it("hashes with bcrypt and never stores the plain text", async () => {
    const hash = await hashPassword("correct horse", COST);
    expect(hash).toMatch(/^\$2[aby]\$04\$/);
    expect(hash).not.toContain("correct horse");
  });

  it("salts: the same password hashes differently each time", async () => {
    expect(await hashPassword("same", COST)).not.toBe(await hashPassword("same", COST));
  });

  it("verifies the right password and rejects the wrong one", async () => {
    const hash = await hashPassword("correct horse", COST);
    expect(await verifyPassword("correct horse", hash)).toBe(true);
    expect(await verifyPassword("wrong horse", hash)).toBe(false);
  });

  it("returns false for an unknown account (null hash) without throwing", async () => {
    expect(await verifyPassword("anything", null)).toBe(false);
  });
});
