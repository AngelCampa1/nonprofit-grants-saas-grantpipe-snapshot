import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import ts from "typescript";
import { getLocalApiOrigin, getLocalWebPort } from "../../scripts/lib/local-dev-config";

const appRoot = dirname(fileURLToPath(import.meta.url));

function applyWranglerViteEnv() {
  const configText = readFileSync(join(appRoot, "wrangler.jsonc"), "utf8");
  const parsed = ts.parseConfigFileTextToJson("wrangler.jsonc", configText);

  if (parsed.error) {
    throw new Error(ts.flattenDiagnosticMessageText(parsed.error.messageText, "\n"));
  }

  const vars = (parsed.config as { vars?: Record<string, unknown> }).vars ?? {};
  for (const key of ["VITE_POSTHOG_KEY", "VITE_POSTHOG_HOST"]) {
    const value = vars[key];
    if (typeof value === "string" && value.trim() && !process.env[key]?.trim()) {
      process.env[key] = value;
    }
  }
}

applyWranglerViteEnv();

const sentryProject = process.env.SENTRY_PROJECT_WEB;
const sentryOrg = process.env.SENTRY_ORG;
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;
const sentryEnabled = Boolean(sentryProject && sentryOrg && sentryAuthToken);

function manualVendorChunks(id: string) {
  if (!id.includes("node_modules")) return undefined;
  if (id.includes("@ventora")) return undefined;
  if (id.includes("@tanstack")) return "vendor-tanstack";
  if (id.includes("recharts") || id.includes("d3-")) return "vendor-charts";
  if (id.includes("lucide-react")) return "vendor-icons";
  if (id.includes("@sentry") || id.includes("posthog-js")) return "vendor-observability";
  if (id.includes("@radix-ui") || id.includes("cmdk") || id.includes("sonner")) {
    return "vendor-ui";
  }
  if (
    id.includes("zod") ||
    id.includes("@hookform") ||
    id.includes("dompurify") ||
    id.includes("better-auth") ||
    id.includes("/hono/")
  ) {
    return "vendor-misc";
  }
  if (id.includes("react") || id.includes("scheduler")) return "vendor-react";
  return undefined;
}

export default defineConfig({
  plugins: [
    TanStackRouterVite({
      autoCodeSplitting: true,
      routeFileIgnorePattern: "\\.(test|spec)\\.(ts|tsx)$",
    }),
    react(),
    tailwindcss(),
    sentryEnabled &&
      sentryVitePlugin({
        org: sentryOrg,
        project: sentryProject,
        authToken: sentryAuthToken,
        sourcemaps: {
          filesToDeleteAfterUpload: ["dist/**/*.js.map"],
        },
      }),
  ].filter(Boolean),
  build: {
    sourcemap: sentryEnabled,
    rollupOptions: {
      output: {
        manualChunks: manualVendorChunks,
      },
    },
  },
  server: {
    port: getLocalWebPort(),
    proxy: {
      "/api": {
        target: getLocalApiOrigin(),
        changeOrigin: true,
      },
    },
  },
});
