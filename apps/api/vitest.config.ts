import { defineConfig } from "vitest/config";
import path from "path";

const HONO_ROOT = path.resolve(
  __dirname,
  "../../node_modules/.pnpm/hono@4.12.12/node_modules/hono",
);
const HONO_DIST = `${HONO_ROOT}/dist`;
const DRIZZLE = "../../packages/db/node_modules/drizzle-orm";
const ZOD_VALIDATOR =
  "../../node_modules/.pnpm/@hono+zod-validator@0.7.6_hono@4.12.12_zod@4.3.6/node_modules/@hono/zod-validator";
const SENTRY_CF = "node_modules/@sentry/cloudflare";

export default defineConfig({
  resolve: {
    // Array form preserves order — more specific entries must come before general ones.
    alias: [
      // drizzle-orm subpaths before drizzle-orm root
      {
        find: "drizzle-orm/pg-core",
        replacement: path.resolve(__dirname, `${DRIZZLE}/pg-core`),
      },
      {
        find: "drizzle-orm",
        replacement: path.resolve(__dirname, DRIZZLE),
      },
      // workspace packages
      {
        find: "@grantpipe/db",
        replacement: path.resolve(__dirname, "../../packages/db/src/index.ts"),
      },
      {
        find: "@grantpipe/shared/public-kb",
        replacement: path.resolve(__dirname, "../../packages/shared/src/public-kb/index.ts"),
      },
      {
        find: "@grantpipe/shared/knowledge",
        replacement: path.resolve(__dirname, "../../packages/shared/src/knowledge/index.ts"),
      },
      {
        find: "@grantpipe/shared",
        replacement: path.resolve(__dirname, "../../packages/shared/src/index.ts"),
      },
      {
        find: "@grantpipe/ui",
        replacement: path.resolve(__dirname, "../../packages/ui/src/index.ts"),
      },
      // hono subpaths before hono root (prevents prefix-match hijacking)
      {
        find: "hono/http-exception",
        replacement: path.resolve(HONO_DIST, "http-exception.js"),
      },
      {
        find: "hono/factory",
        replacement: path.resolve(HONO_DIST, "helper/factory/index.js"),
      },
      {
        find: "hono/cors",
        replacement: path.resolve(HONO_DIST, "middleware/cors/index.js"),
      },
      {
        find: "hono/logger",
        replacement: path.resolve(HONO_DIST, "middleware/logger/index.js"),
      },
      {
        find: "hono/secure-headers",
        replacement: path.resolve(HONO_DIST, "middleware/secure-headers/index.js"),
      },
      {
        find: "hono/timing",
        replacement: path.resolve(HONO_DIST, "middleware/timing/index.js"),
      },
      // hono root (bare specifier only — must come after subpaths)
      {
        find: /^hono$/,
        replacement: path.resolve(HONO_DIST, "index.js"),
      },
      // @hono/* and @sentry/*
      {
        find: "@hono/zod-validator",
        replacement: path.resolve(__dirname, ZOD_VALIDATOR),
      },
      {
        find: "@sentry/cloudflare",
        replacement: path.resolve(__dirname, SENTRY_CF),
      },
      // Cloudflare-only packages — stub for unit tests
      {
        find: "@cloudflare/puppeteer",
        replacement: path.resolve(__dirname, "src/__stubs__/cloudflare-puppeteer.ts"),
      },
    ],
  },
  test: {
    globals: true,
    coverage: {
      provider: "v8",
      all: true,
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/index.ts", "vitest.config.ts", "src/__stubs__/**"],
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
