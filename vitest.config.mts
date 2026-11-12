import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const obsidianStub = fileURLToPath(new URL("./test/mocks/obsidian.ts", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      // Runtime code is never imported by unit tests, but the type-only imports
      // in adapters still need a resolvable module during collection.
      obsidian: obsidianStub,
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
    environment: "jsdom",
    setupFiles: ["./test/setup/obsidian-dom.ts"],
    restoreMocks: true,
  },
});
