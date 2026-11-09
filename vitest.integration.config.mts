import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/** Database-backed tests. They need TEST_DATABASE_URL and fail loudly without it (see tests/integration/global-setup.ts). */
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    globalSetup: ["tests/integration/global-setup.ts"],
    setupFiles: ["tests/integration/setup-env.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
