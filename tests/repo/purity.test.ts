import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../../src/lib");
const PURE_DIRS = ["cost-engine", "rates", "format", "auth", "rfq", "costing", "quote"];
const FORBIDDEN = /from\s+["'](@prisma\/client|next(\/.*)?|react(\/.*)?|react-dom(\/.*)?|next-auth(\/.*)?)["']|from\s+["']@\/(server|app|components)\//;

describe("pure modules stay pure", () => {
  for (const dir of PURE_DIRS) {
    it(`src/lib/${dir} imports no database, framework or UI code`, () => {
      const files = readdirSync(path.join(root, dir)).filter((f) => f.endsWith(".ts"));
      expect(files.length).toBeGreaterThan(0);
      for (const file of files) {
        const source = readFileSync(path.join(root, dir, file), "utf8");
        expect(source, `${dir}/${file}`).not.toMatch(FORBIDDEN);
      }
    });
  }
});
