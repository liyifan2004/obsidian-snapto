import { defineConfig, globalIgnores } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
  // Build output and Node build scripts are not plugin code.
  globalIgnores([
    "node_modules",
    "main.js",
    "scripts",
    "esbuild.config.mjs",
    "vitest.config.mts",
    "test/mocks",
  ]),
  ...obsidianmd.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["eslint.config.*"],
        },
      },
    },
  },
]);
