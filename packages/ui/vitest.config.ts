import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "astro:content": path.resolve(__dirname, "src/site/__stubs__/astro-content.ts"),
      "/pagefind/pagefind.js": path.resolve(__dirname, "src/site/__stubs__/pagefind.ts"),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    coverage: {
      provider: "v8",
      all: true,
      clean: false,
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: ["src/index.ts", "src/test-setup.ts"],
      reporter: ["text", "json-summary", "json"],
      thresholds: {
        perFile: true,
        lines: 95,
        functions: 95,
        branches: 95,
        statements: 95,
      },
    },
  },
});
