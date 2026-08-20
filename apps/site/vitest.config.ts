import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@grantpipe/shared/public-kb": fileURLToPath(
        new URL("../../packages/shared/src/public-kb/index.ts", import.meta.url),
      ),
      "@grantpipe/shared": fileURLToPath(
        new URL("../../packages/shared/src/index.ts", import.meta.url),
      ),
      "cloudflare:workers": fileURLToPath(
        new URL("./test/stubs/cloudflare-workers.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    testTimeout: 15_000,
    exclude: ["**/node_modules/**", "**/dist/**", "**/playwright/**"],
    coverage: {
      provider: "v8",
      include: [
        "src/config/grant-recipient-seo.ts",
        "src/config/personas.ts",
        "src/config/site.ts",
        "src/content.config.ts",
        "src/lib/**/*.ts",
        "src/middleware.ts",
        "src/pages/api/**/*.ts",
        "src/pages/rss.xml.ts",
        "scripts/**/*.ts",
      ],
      exclude: ["src/lib/**/*.test.ts", "scripts/**/*.test.ts", "scripts/run-*.ts"],
      thresholds: { statements: 95, branches: 95, functions: 95, lines: 95 },
      reporter: ["text", "html", "lcov", "json-summary"],
    },
  },
});
