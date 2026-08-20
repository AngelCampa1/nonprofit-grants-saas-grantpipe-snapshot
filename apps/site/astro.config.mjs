import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import cloudflare from "@astrojs/cloudflare";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import { indexNowIntegration } from "@grantpipe/ui/site/lib/indexnow-integration";
import { sitemapDatesIntegration } from "@grantpipe/ui/site/lib/sitemap-dates-integration";
import { createSitemapSerializer } from "@grantpipe/ui/site/lib/sitemap-utils";
import { marketingKnowledge } from "@grantpipe/shared/public-kb";
import { getGrantPipePricingCopy } from "@grantpipe/shared";

// Pages with noindex frontmatter — keep in sync with content that sets noindex: true
export const noindexPages = new Set([
  "/llms.txt",
  "/llms-full.txt",
  "/unsubscribe/",
  "/signup/",
  "/404/",
  "/500/",
  "/board/report/",
  "/donor/crm-grants/",
  "/donor/retention/",
  "/donor/unified/",
  "/ed/alternative/",
  "/ed/board-questions/",
  "/ed/key-person/",
  "/ed/no-consultant/",
  "/ed/one-system/",
  "/features/multi-entity-consolidation/",
  "/grant/management/",
  "/grant/compliance/",
  "/grant/pipeline/",
  "/grant/reporting/",
  "/grant/solo/",
  "/funds/affordable/",
  "/funds/audit/",
  "/funds/drawdown/",
  "/funds/payroll/",
  "/restricted/funds/",
  "/granthub/migration/",
]);
export const paidLandingPagePattern = /^\/lp(?:\/|$)/;
export const paginatedHubPattern =
  /^\/(?:free\/\d+|compare\/(?:alternatives|pricing|versus)\/\d+|resources\/(?:page|guides|best)\/\d+)\/?$/;

export function isSitemapPageIncluded(page) {
  const path = new globalThis.URL(page).pathname;
  return (
    !noindexPages.has(path) && !paidLandingPagePattern.test(path) && !paginatedHubPattern.test(path)
  );
}

const staticSitemapDates = {
  "/": "2026-04-07",
  "/about/": "2026-04-07",
  "/books/": "2026-04-07",
  "/compare/": "2026-04-07",
  "/grant-management-software/": "2026-07-04",
  "/grant-reporting-software/": "2026-04-07",
  "/grant-tracking-software/": "2026-04-07",
  "/grant-compliance-software/": "2026-07-04",
  "/nonprofit-software/": "2026-04-07",
  "/pricing/": "2026-07-04",
  "/product/": "2026-07-04",
  "/resources/": "2026-04-07",
  "/restricted-fund-tracking-software/": "2026-04-07",
  "/solutions/": "2026-04-07",
  "/terms/": "2026-04-07",
  "/workflows/": "2026-04-07",
};
const sitemapFallbackLastmod = "2026-04-07";
const indexNowEnabled = globalThis.process?.env?.INDEXNOW_ENABLED === "true";
const sentryProject = globalThis.process?.env?.SENTRY_PROJECT_SITE;
const sentryOrg = globalThis.process?.env?.SENTRY_ORG;
const sentryAuthToken = globalThis.process?.env?.SENTRY_AUTH_TOKEN;
const sentryEnabled = Boolean(sentryProject && sentryOrg && sentryAuthToken);
const sentryClientPlugin = sentryEnabled
  ? sentryVitePlugin({
      org: sentryOrg,
      project: sentryProject,
      authToken: sentryAuthToken,
      sourcemaps: {
        filesToDeleteAfterUpload: ["dist/**/*.js.map"],
      },
    })
  : undefined;
const markdownLinkTargets = new Map([["grantpipe:signup", marketingKnowledge.brand.signupUrl]]);
const pricingCopy = getGrantPipePricingCopy();
const markdownPricingTokens = new Map([
  ["{{grantpipe.price.starterMonthly}}", pricingCopy.starterMonthly],
  ["{{grantpipe.price.starterAnnual}}", pricingCopy.starterAnnual],
  ["{{grantpipe.price.growthMonthly}}", pricingCopy.growthMonthly],
  ["{{grantpipe.price.growthAnnual}}", pricingCopy.growthAnnual],
  ["{{grantpipe.price.auditReadyMonthly}}", pricingCopy.auditReadyMonthly],
  ["{{grantpipe.price.auditReadyAnnual}}", pricingCopy.auditReadyAnnual],
  ["{{grantpipe.price.selfServeRange}}", pricingCopy.selfServeListRange],
  ["{{grantpipe.price.selfServeListRange}}", pricingCopy.selfServeListRange],
]);
const generatedPrerenderChunkImportPattern =
  /(?:from\s*["']|import\s*["'])\.\/((?:chunks\/)?[^"']+\.mjs)["']|import\(["']\.\/((?:chunks\/)?(?:noop-entrypoint|content-assets)_[^"']+\.mjs)["']\)/g;

function canonicalPublicKnowledgeLinks() {
  return (tree) => {
    const visit = (node) => {
      if (!node || typeof node !== "object") return;

      if (node.tagName === "a" && node.properties?.href) {
        const href = String(node.properties.href);
        const canonicalHref = markdownLinkTargets.get(href);
        if (canonicalHref) node.properties.href = canonicalHref;
      }

      if (Array.isArray(node.children)) {
        for (const child of node.children) visit(child);
      }
    };

    visit(tree);
  };
}

function replaceGrantPipePricingTokens() {
  return (tree) => {
    const visit = (node) => {
      if (!node || typeof node !== "object") return;

      if (node.type === "text" && typeof node.value === "string") {
        let value = node.value;
        for (const [token, replacement] of markdownPricingTokens) {
          value = value.replaceAll(token, replacement);
        }
        node.value = value;
      }

      if (Array.isArray(node.children)) {
        for (const child of node.children) visit(child);
      }
    };

    visit(tree);
  };
}

function materializeMissingGeneratedPrerenderChunks() {
  function sourceForGeneratedChunk(fileName) {
    const baseName = fileName.split("/").at(-1) ?? fileName;
    return baseName.startsWith("content-assets_")
      ? "export default new Map();\n"
      : "export const server = {};\n";
  }

  function collectGeneratedChunkImports(chunks, existingFileNames, options = {}) {
    const skipExistingFiles = options.skipExistingFiles ?? false;
    const chunkNames = existingFileNames ?? new Set(chunks.map((chunk) => chunk.fileName));
    const missing = [];

    for (const chunk of chunks) {
      if (chunk.type && chunk.type !== "chunk") {
        continue;
      }

      for (const match of chunk.code.matchAll(generatedPrerenderChunkImportPattern)) {
        const importedFileName = resolveGeneratedChunkImport(chunk.fileName, match[1] ?? match[2]);
        if (!importedFileName || missing.includes(importedFileName)) {
          continue;
        }

        const baseName = importedFileName.split("/").at(-1) ?? importedFileName;
        if (
          baseName.startsWith("_") ||
          (skipExistingFiles && chunkNames.has(importedFileName)) ||
          (baseName.startsWith("content-assets_") && chunkNames.has(importedFileName))
        ) {
          continue;
        }

        missing.push(importedFileName);
      }
    }

    return missing;
  }

  function resolveGeneratedChunkImport(importerFileName, importedFileName) {
    if (!importedFileName) return importedFileName;
    if (importedFileName.includes("/")) return importedFileName;

    const importerDirectory = importerFileName.includes("/")
      ? importerFileName.slice(0, importerFileName.lastIndexOf("/") + 1)
      : "";
    return `${importerDirectory}${importedFileName}`;
  }

  return {
    name: "grantpipe-materialize-missing-generated-prerender-chunks",
    generateBundle(_options, bundle) {
      const bundleValues = Object.values(bundle);
      const chunks = bundleValues.filter((entry) => entry.type === "chunk");
      const existingFileNames = new Set(bundleValues.map((entry) => entry.fileName));
      const missingFileNames = new Set(
        collectGeneratedChunkImports(chunks, existingFileNames, {
          skipExistingFiles: true,
        }),
      );

      for (const importedFileName of missingFileNames) {
        this.emitFile({
          type: "asset",
          fileName: importedFileName,
          source: sourceForGeneratedChunk(importedFileName),
        });
      }
    },
    api: {
      buildPostHook({ chunks, mutate }) {
        const existingFileNames = new Set(chunks.map((chunk) => chunk.fileName));
        const missingFileNames = new Set(
          collectGeneratedChunkImports(chunks, existingFileNames, {
            skipExistingFiles: true,
          }),
        );

        for (const importedFileName of missingFileNames) {
          mutate(importedFileName, sourceForGeneratedChunk(importedFileName), true);
        }
      },
    },
  };
}

function applyPluginsToEnvironment(environmentName, pluginOptions) {
  return {
    name: `grantpipe-${environmentName}-environment-plugins`,
    applyToEnvironment(environment) {
      return environment.name === environmentName ? pluginOptions : false;
    },
  };
}

export default defineConfig({
  site: "https://grantpipe.com",
  output: "static",
  trailingSlash: "always",
  build: {
    concurrency: 1,
  },
  markdown: {
    rehypePlugins: [canonicalPublicKnowledgeLinks, replaceGrantPipePricingTokens],
  },
  adapter: cloudflare({
    imageService: { build: "compile", runtime: "passthrough" },
    prerenderEnvironment: "node",
  }),
  integrations: [
    react(),
    sitemap({
      filter: isSitemapPageIncluded,
      serialize: createSitemapSerializer(staticSitemapDates, {
        fallbackLastmod: sitemapFallbackLastmod,
      }),
    }),
    indexNowIntegration({ enabled: indexNowEnabled }),
    sitemapDatesIntegration(),
  ],
  vite: {
    resolve: {
      dedupe: ["react", "react-dom"],
    },
    plugins: [
      tailwindcss(),
      applyPluginsToEnvironment("client", [sentryClientPlugin].filter(Boolean).flat()),
      applyPluginsToEnvironment("ssr", [materializeMissingGeneratedPrerenderChunks()]),
    ].filter(Boolean),
    build: {
      sourcemap: false,
      rollupOptions: {
        output: {
          chunkFileNames: "chunks/[hash].mjs",
        },
      },
    },
    environments: {
      client: {
        build: {
          sourcemap: sentryEnabled,
        },
      },
      ssr: {},
    },
  },
});
