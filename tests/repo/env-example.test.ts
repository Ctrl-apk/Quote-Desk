import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const envExample = readFileSync(path.resolve(__dirname, "../../.env.example"), "utf8");
const entries = envExample
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line !== "" && !line.startsWith("#"));

describe(".env.example", () => {
  it("lists variable names only, never values", () => {
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry, `"${entry}" must be NAME= with no value`).toMatch(/^[A-Z][A-Z0-9_]*=$/);
    }
  });

  it("declares the variables the app needs", () => {
    const names = entries.map((entry) => entry.slice(0, -1));
    expect(names).toEqual(
      expect.arrayContaining(["DATABASE_URL", "AUTH_SECRET", "LLM_API_KEY"]),
    );
  });
});
