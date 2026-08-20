import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockIndexNowIntegration = vi.fn(() => ({
  name: "@validation/indexnow",
  hooks: {},
}));
const mockDefineConfig = vi.fn((config: unknown) => config);
const mockCloudflare = vi.fn(() => ({ name: "cloudflare" }));
const mockSentryVitePlugin = vi.fn((config: unknown) => [
  {
    name: "sentry-vite-plugin",
    config,
  },
]);

vi.mock("@grantpipe/ui/site/lib/indexnow-integration", () => ({
  indexNowIntegration: mockIndexNowIntegration,
}));
vi.mock("astro/config", () => ({
  defineConfig: mockDefineConfig,
}));
vi.mock("@astrojs/react", () => ({
  default: vi.fn(() => ({ name: "react" })),
}));
vi.mock("@astrojs/cloudflare", () => ({
  default: mockCloudflare,
}));
vi.mock("@astrojs/sitemap", () => ({
  default: vi.fn((options: Record<string, unknown>) => ({
    name: "sitemap",
    ...options,
  })),
}));
vi.mock("@tailwindcss/vite", () => ({
  default: vi.fn(() => ({ name: "tailwindcss" })),
}));
vi.mock("@sentry/vite-plugin", () => ({
  sentryVitePlugin: mockSentryVitePlugin,
}));

const pagesDirectory = join(import.meta.dirname, "pages");

function walk(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
    } else if (entry.name.endsWith(".astro")) {
      files.push(fullPath);
    }
  }
  return files;
}

function staticPageRoute(filePath: string): string | null {
  const relativePath = relative(pagesDirectory, filePath).replace(/\\/g, "/");
  if (relativePath.includes("[")) return null;

  const withoutExtension = relativePath.replace(/\.astro$/, "");
  const segments = withoutExtension.split("/").filter(Boolean);
  const routeSegments = segments.at(-1) === "index" ? segments.slice(0, -1) : segments;
  return `https://grantpipe.com/${routeSegments.join("/")}${routeSegments.length ? "/" : ""}`;
}

function staticPageSourceHasNoindex(source: string): boolean {
  if (/noindex\s*=\s*{\s*true\s*}/.test(source)) return true;

  const robotsMetaTags = source.match(/<meta\b[^>]*>/gi) ?? [];
  return robotsMetaTags.some((tag) => {
    const hasRobotsName = /\bname\s*=\s*["']robots["']/i.test(tag);
    const noindexContent = /\bcontent\s*=\s*["'][^"']*\bnoindex\b[^"']*["']/i.test(tag);
    return hasRobotsName && noindexContent;
  });
}

function staticNoindexRoutes(): string[] {
  return walk(pagesDirectory)
    .filter((filePath) => {
      const source = readFileSync(filePath, "utf8");
      return staticPageSourceHasNoindex(source);
    })
    .map(staticPageRoute)
    .filter((route): route is string => route !== null)
    .sort();
}

function getEnvironmentPlugins<TPlugin>(
  plugin:
    | {
        applyToEnvironment?: (environment: { name: string }) => TPlugin[] | false;
      }
    | undefined,
  environmentName: string,
): TPlugin[] {
  const result = plugin?.applyToEnvironment?.({ name: environmentName });
  return Array.isArray(result) ? result : [];
}

describe("astro config IndexNow wiring", () => {
  beforeEach(() => {
    vi.resetModules();
    mockIndexNowIntegration.mockClear();
    mockDefineConfig.mockClear();
    mockCloudflare.mockClear();
    mockSentryVitePlugin.mockClear();
    delete process.env.INDEXNOW_ENABLED;
    delete process.env.SENTRY_AUTH_TOKEN;
    delete process.env.SENTRY_ORG;
    delete process.env.SENTRY_PROJECT_SITE;
  });

  it("disables IndexNow by default", async () => {
    const config = await import("../astro.config.mjs");
    const integrations = (config.default.integrations ?? []) as unknown[];
    const sitemapIntegration = integrations[1] as {
      filter: (page: string) => boolean;
    };

    expect(mockIndexNowIntegration).toHaveBeenCalledWith({ enabled: false });
    expect(sitemapIntegration.filter("https://grantpipe.com/llms.txt")).toBe(false);
    expect(sitemapIntegration.filter("https://grantpipe.com/404/")).toBe(false);
    expect(sitemapIntegration.filter("https://grantpipe.com/500/")).toBe(false);
    expect(sitemapIntegration.filter("https://grantpipe.com/lp/grant-compliance-software/")).toBe(
      false,
    );
    expect(sitemapIntegration.filter("https://grantpipe.com/grant/management/")).toBe(false);
    expect(sitemapIntegration.filter("https://grantpipe.com/grant/compliance/")).toBe(false);
    expect(sitemapIntegration.filter("https://grantpipe.com/grant/reporting/")).toBe(false);
    expect(sitemapIntegration.filter("https://grantpipe.com/restricted/funds/")).toBe(false);
    expect(sitemapIntegration.filter("https://grantpipe.com/granthub/migration/")).toBe(false);
    expect(
      sitemapIntegration.filter("https://grantpipe.com/lp/grant-compliance-software/audience/"),
    ).toBe(false);
    expect(sitemapIntegration.filter("https://grantpipe.com/free/2/")).toBe(false);
    expect(sitemapIntegration.filter("https://grantpipe.com/resources/page/2/")).toBe(false);
    expect(sitemapIntegration.filter("https://grantpipe.com/resources/guides/3/")).toBe(false);
    expect(sitemapIntegration.filter("https://grantpipe.com/resources/best/2/")).toBe(false);
    expect(sitemapIntegration.filter("https://grantpipe.com/compare/alternatives/2/")).toBe(false);
    expect(sitemapIntegration.filter("https://grantpipe.com/compare/pricing/2/")).toBe(false);
    expect(sitemapIntegration.filter("https://grantpipe.com/compare/versus/2/")).toBe(false);
    expect(sitemapIntegration.filter("https://grantpipe.com/resources/123/")).toBe(true);
    expect(sitemapIntegration.filter("https://grantpipe.com/resources/guide/")).toBe(true);
    expect(mockSentryVitePlugin).not.toHaveBeenCalled();
  }, 30_000);

  it("excludes every static noindex page from the sitemap", async () => {
    const config = await import("../astro.config.mjs");
    const integrations = (config.default.integrations ?? []) as unknown[];
    const sitemapIntegration = integrations[1] as {
      filter: (page: string) => boolean;
    };

    expect(staticNoindexRoutes()).toContain("https://grantpipe.com/board/report/");

    for (const route of staticNoindexRoutes()) {
      expect(sitemapIntegration.filter(route), `${route} should be excluded`).toBe(false);
    }
  }, 30_000);

  it("uses stable lastmod dates for static sitemap routes", async () => {
    const config = await import("../astro.config.mjs");
    const integrations = (config.default.integrations ?? []) as unknown[];
    const sitemapIntegration = integrations[1] as {
      serialize: (item: { url: string }) => { lastmod?: Date };
    };

    const root = sitemapIntegration.serialize({ url: "https://grantpipe.com/" });
    const pricing = sitemapIntegration.serialize({
      url: "https://grantpipe.com/pricing/",
    });

    expect(root.lastmod?.toISOString().startsWith("2026-04-07")).toBe(true);
    expect(pricing.lastmod?.toISOString().startsWith("2026-07-04")).toBe(true);
  });

  it("replaces GrantPipe pricing tokens in markdown text nodes", async () => {
    const config = await import("../astro.config.mjs");
    const rehypePlugins = config.default.markdown?.rehypePlugins;
    expect(rehypePlugins).toBeDefined();
    const pricingTokenPlugin = rehypePlugins?.[1] as () => (tree: unknown) => void;
    const tree = {
      type: "root",
      children: [
        {
          type: "text",
          value:
            "{{grantpipe.price.selfServeRange}} and {{grantpipe.price.starterAnnual}} via GrantPipe publishes flat pricing.",
        },
      ],
    };

    pricingTokenPlugin()(tree);

    expect(tree.children[0]?.value).toBe(
      "$49-$199/mo list price and $39/mo via GrantPipe publishes flat pricing.",
    );
  });

  it("uses the Node prerender environment for static build compatibility", async () => {
    await import("../astro.config.mjs");

    expect(mockCloudflare).toHaveBeenCalledWith(
      expect.objectContaining({
        prerenderEnvironment: "node",
      }),
    );
  });

  it("serializes prerender output generation to avoid transient chunk races", async () => {
    const config = await import("../astro.config.mjs");

    expect(config.default.build).toEqual(expect.objectContaining({ concurrency: 1 }));
  });

  it("materializes missing Astro generated chunks before prerender", async () => {
    const config = await import("../astro.config.mjs");
    const plugins = config.default.vite?.plugins as Array<{
      name?: string;
      applyToEnvironment?: (environment: { name: string }) =>
        | Array<{
            name?: string;
            generateBundle?: (
              this: {
                emitFile: (file: { type: "asset"; fileName: string; source: string }) => string;
              },
              options: unknown,
              bundle: Record<
                string,
                { code?: string; fileName: string; prerender?: boolean; type?: "asset" | "chunk" }
              >,
            ) => void;
            api?: {
              buildPostHook?: (options: {
                chunks: Array<{
                  code: string;
                  fileName: string;
                  prerender: boolean;
                  type?: "chunk";
                }>;
                mutate: (fileName: string, code: string, prerender: boolean) => void;
              }) => void;
            };
          }>
        | false;
    }>;
    const ssrEnvironmentPlugin = plugins.find(
      (candidate) => candidate.name === "grantpipe-ssr-environment-plugins",
    );
    const plugin = getEnvironmentPlugins(ssrEnvironmentPlugin, "ssr")[0] as
      | {
          name?: string;
          generateBundle?: (
            this: {
              emitFile: (file: { type: "asset"; fileName: string; source: string }) => string;
            },
            options: unknown,
            bundle: Record<
              string,
              { code?: string; fileName: string; prerender?: boolean; type?: "asset" | "chunk" }
            >,
          ) => void;
          api?: {
            buildPostHook?: (options: {
              chunks: Array<{ code: string; fileName: string; prerender: boolean; type?: "chunk" }>;
              mutate: (fileName: string, code: string, prerender: boolean) => void;
            }) => void;
          };
        }
      | undefined;

    const mutations: Array<{ fileName: string; code: string; prerender: boolean }> = [];
    const emittedFiles: Array<{ type: "asset"; fileName: string; source: string }> = [];
    plugin?.api?.buildPostHook?.({
      chunks: [
        {
          fileName: "chunks/prerender_test.mjs",
          prerender: true,
          code: [
            'import "./chunks/noop-entrypoint_hook.mjs";',
            'import"./chunks/noop-entrypoint_minified.mjs";',
            'import{server as noopServer}from"./chunks/noop-entrypoint_named.mjs";',
            'await import("./chunks/content-assets_hook.mjs");',
            'import{default as contentAssets}from"./chunks/content-assets_named.mjs";',
            'await import("./content-assets_relative.mjs");',
            'import{server as hashedServer}from"./chunks/TOYy-8Xv.mjs";',
            'const _page = () => import("./chunks/ABCpage.mjs");',
          ].join("\n"),
        },
        {
          fileName: "chunks/noop-entrypoint_hook.mjs",
          prerender: true,
          code: "export const server = {};",
        },
        {
          fileName: "chunks/content-assets_hook.mjs",
          prerender: true,
          code: "export default new Map([['existing', 'asset']]);",
        },
      ],
      mutate: (fileName, code, prerender) => mutations.push({ fileName, code, prerender }),
    });
    plugin?.generateBundle?.call(
      {
        emitFile: (file) => {
          emittedFiles.push(file);
          return file.fileName;
        },
      },
      {},
      {
        "chunks/prerender_test.mjs": {
          type: "chunk",
          fileName: "chunks/prerender_test.mjs",
          prerender: true,
          code: [
            'import "./chunks/noop-entrypoint_hook.mjs";',
            'import"./chunks/noop-entrypoint_minified.mjs";',
            'import{server as noopServer}from"./chunks/noop-entrypoint_named.mjs";',
            'await import("./chunks/content-assets_hook.mjs");',
            'import{default as contentAssets}from"./chunks/content-assets_named.mjs";',
            'await import("./content-assets_relative.mjs");',
            'import{server as hashedServer}from"./chunks/TOYy-8Xv.mjs";',
          ].join("\n"),
        },
        "chunks/noop-entrypoint_hook.mjs": {
          type: "chunk",
          fileName: "chunks/noop-entrypoint_hook.mjs",
          prerender: true,
          code: "export const server = {};",
        },
        "chunks/content-assets_hook.mjs": {
          type: "chunk",
          fileName: "chunks/content-assets_hook.mjs",
          prerender: true,
          code: "export default new Map([['existing', 'asset']]);",
        },
      },
    );

    expect(mutations).toEqual([
      {
        fileName: "chunks/noop-entrypoint_minified.mjs",
        code: "export const server = {};\n",
        prerender: true,
      },
      {
        fileName: "chunks/noop-entrypoint_named.mjs",
        code: "export const server = {};\n",
        prerender: true,
      },
      {
        fileName: "chunks/content-assets_named.mjs",
        code: "export default new Map();\n",
        prerender: true,
      },
      {
        fileName: "chunks/content-assets_relative.mjs",
        code: "export default new Map();\n",
        prerender: true,
      },
      {
        fileName: "chunks/TOYy-8Xv.mjs",
        code: "export const server = {};\n",
        prerender: true,
      },
    ]);
    expect(emittedFiles).toEqual([
      {
        type: "asset",
        fileName: "chunks/noop-entrypoint_minified.mjs",
        source: "export const server = {};\n",
      },
      {
        type: "asset",
        fileName: "chunks/noop-entrypoint_named.mjs",
        source: "export const server = {};\n",
      },
      {
        type: "asset",
        fileName: "chunks/content-assets_named.mjs",
        source: "export default new Map();\n",
      },
      {
        type: "asset",
        fileName: "chunks/content-assets_relative.mjs",
        source: "export default new Map();\n",
      },
      {
        type: "asset",
        fileName: "chunks/TOYy-8Xv.mjs",
        source: "export const server = {};\n",
      },
    ]);
    expect(getEnvironmentPlugins(ssrEnvironmentPlugin, "ssr")[0]?.name).toBe(
      "grantpipe-materialize-missing-generated-prerender-chunks",
    );
    expect(getEnvironmentPlugins(ssrEnvironmentPlugin, "client")).toEqual([]);
    expect(emittedFiles.some((file) => file.fileName === "chunks/noop-entrypoint_hook.mjs")).toBe(
      false,
    );
  });

  it("does not materialize dynamic route chunks as inert stubs", async () => {
    const config = await import("../astro.config.mjs");
    const plugins = config.default.vite?.plugins as Array<{
      name?: string;
      applyToEnvironment?: (environment: { name: string }) =>
        | Array<{
            name?: string;
            generateBundle?: (
              this: {
                emitFile: (file: { type: "asset"; fileName: string; source: string }) => string;
              },
              options: unknown,
              bundle: Record<
                string,
                { code?: string; fileName: string; prerender?: boolean; type?: "asset" | "chunk" }
              >,
            ) => void;
            api?: {
              buildPostHook?: (options: {
                chunks: Array<{
                  code: string;
                  fileName: string;
                  prerender: boolean;
                  type?: "chunk";
                }>;
                mutate: (fileName: string, code: string, prerender: boolean) => void;
              }) => void;
            };
          }>
        | false;
    }>;
    const ssrEnvironmentPlugin = plugins.find(
      (candidate) => candidate.name === "grantpipe-ssr-environment-plugins",
    );
    const plugin = getEnvironmentPlugins(ssrEnvironmentPlugin, "ssr")[0];
    const routeChunkCode = [
      'import{server as slugServer}from"./chunks/_slug__abc123.mjs";',
      'await import("./chunks/_city__def456.mjs");',
    ].join("\n");
    const mutations: Array<{ fileName: string; code: string; prerender: boolean }> = [];
    const emittedFiles: Array<{ type: "asset"; fileName: string; source: string }> = [];

    plugin?.api?.buildPostHook?.({
      chunks: [
        {
          fileName: "chunks/prerender_routes.mjs",
          prerender: true,
          type: "chunk",
          code: routeChunkCode,
        },
      ],
      mutate: (fileName, code, prerender) => mutations.push({ fileName, code, prerender }),
    });
    plugin?.generateBundle?.call(
      {
        emitFile: (file) => {
          emittedFiles.push(file);
          return file.fileName;
        },
      },
      {},
      {
        "chunks/prerender_routes.mjs": {
          type: "chunk",
          fileName: "chunks/prerender_routes.mjs",
          prerender: true,
          code: routeChunkCode,
        },
      },
    );

    expect(mutations).toEqual([]);
    expect(emittedFiles).toEqual([]);
  });

  it("uses hash-only SSR chunk names to avoid unstable dynamic route chunk names", async () => {
    const config = await import("../astro.config.mjs");

    expect(config.default.vite?.build).toEqual(
      expect.objectContaining({
        rollupOptions: {
          output: {
            chunkFileNames: "chunks/[hash].mjs",
          },
        },
      }),
    );
  });

  it("enables IndexNow when the build flag is set", async () => {
    process.env.INDEXNOW_ENABLED = "true";

    await import("../astro.config.mjs");

    expect(mockIndexNowIntegration).toHaveBeenCalledWith({ enabled: true });
  });

  it("enables private Sentry source-map upload when build env is present", async () => {
    process.env.SENTRY_AUTH_TOKEN = "token";
    process.env.SENTRY_ORG = "grantpipe";
    process.env.SENTRY_PROJECT_SITE = "grantpipe-site";

    const config = await import("../astro.config.mjs");
    const plugins = config.default.vite?.plugins as Array<{
      name?: string;
      applyToEnvironment?: (environment: { name: string }) => Array<{ name?: string }> | false;
    }>;
    const environments = config.default.vite?.environments as
      | Record<string, { build?: { sourcemap?: boolean } }>
      | undefined;
    const clientEnvironmentPlugin = plugins.find(
      (plugin) => plugin.name === "grantpipe-client-environment-plugins",
    );

    expect(mockSentryVitePlugin).toHaveBeenCalledWith(
      expect.objectContaining({
        authToken: "token",
        org: "grantpipe",
        project: "grantpipe-site",
        sourcemaps: {
          filesToDeleteAfterUpload: ["dist/**/*.js.map"],
        },
      }),
    );
    expect(plugins.some((plugin) => plugin.name === "sentry-vite-plugin")).toBe(false);
    expect(getEnvironmentPlugins(clientEnvironmentPlugin, "client")[0]?.name).toBe(
      "sentry-vite-plugin",
    );
    expect(getEnvironmentPlugins(clientEnvironmentPlugin, "ssr")).toEqual([]);
    expect(config.default.vite?.build).toEqual(expect.objectContaining({ sourcemap: false }));
    expect(environments?.client?.build).toEqual(expect.objectContaining({ sourcemap: true }));
  });
});
