import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  isCliInvocation,
  patchCanonicalHostRedirect,
  patchSiteEntry,
  resolveEntryPath,
} from "../../../scripts/patch-site-canonical-host-redirect";

const generatedEntry = `const app = createApp();
async function handle(request, env, context) {
  const { pathname: requestPathname } = new URL(request.url);
  if (app.manifest.assets.has(requestPathname)) {
    return env.ASSETS.fetch(request.url.replace(/\\.html$/, ""));
  }
  return app.render(request);
}`;

describe("patchCanonicalHostRedirect", () => {
  it("injects www-to-apex redirect before generated asset handling", () => {
    const patched = patchCanonicalHostRedirect(generatedEntry);

    expect(patched).toContain("grantpipe-canonical-host-redirect");
    expect(patched).toContain('canonicalHostUrl.hostname === "www.grantpipe.com"');
    expect(patched).toContain('canonicalHostUrl.hostname = "grantpipe.com"');
    expect(patched.indexOf("grantpipe-canonical-host-redirect")).toBeLessThan(
      patched.indexOf("app.manifest.assets.has(requestPathname)"),
    );
  });

  it("injects slashless HTML page redirects before generated asset handling", () => {
    const patched = patchCanonicalHostRedirect(generatedEntry);

    expect(patched).toContain("grantpipe-canonical-path-redirect");
    expect(patched).toContain("grantpipe-static-asset-first");
    expect(patched).toContain('canonicalHostUrl.pathname.endsWith("/")');
    expect(patched).toContain('canonicalHostUrl.pathname += "/"');
    expect(patched).toContain('!canonicalHostUrl.pathname.split("/").pop()?.includes(".")');
    expect(patched.indexOf("grantpipe-canonical-path-redirect")).toBeLessThan(
      patched.indexOf("app.manifest.assets.has(requestPathname)"),
    );
    expect(patched.indexOf("grantpipe-static-asset-first")).toBeLessThan(
      patched.indexOf("app.manifest.assets.has(requestPathname)"),
    );
  });

  it("keeps file-like and reserved machine-readable paths out of slash redirects", () => {
    const patched = patchCanonicalHostRedirect(generatedEntry);

    expect(patched).toContain('canonicalPathname !== "/robots.txt"');
    expect(patched).toContain('canonicalPathname !== "/llms.txt"');
    expect(patched).toContain('canonicalPathname !== "/llms-full.txt"');
    expect(patched).toContain('canonicalPathname !== "/pricing.txt"');
    expect(patched).toContain('canonicalPathname !== "/rss.xml"');
    expect(patched).toContain('canonicalPathname !== "/sitemap-index.xml"');
    expect(patched).toContain('canonicalPathname !== "/signup-flow.json"');
  });

  it("is idempotent", () => {
    const patched = patchCanonicalHostRedirect(generatedEntry);

    expect(patchCanonicalHostRedirect(patched)).toBe(patched);
  });

  it("keeps canonical redirects before the static asset short-circuit", () => {
    const patched = patchCanonicalHostRedirect(generatedEntry);

    expect(patched.indexOf("grantpipe-canonical-host-redirect")).toBeLessThan(
      patched.indexOf("grantpipe-static-asset-first"),
    );
    expect(patched.indexOf("grantpipe-canonical-path-redirect")).toBeLessThan(
      patched.indexOf("grantpipe-static-asset-first"),
    );
  });

  it("serves directory pre-rendered pages through their index asset", () => {
    const patched = patchCanonicalHostRedirect(generatedEntry);

    expect(patched).toContain('assetUrl.pathname += "index.html"');
    expect(patched).toContain("env.ASSETS.fetch(assetUrl)");
  });

  it("patches imported worker chunks when Astro wraps the generated entry", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "grantpipe-site-entry-"));
    const chunksDir = join(tempRoot, "chunks");
    const entryPath = join(tempRoot, "entry.mjs");
    const chunkPath = join(chunksDir, "worker-entry_test.mjs");

    mkdirSync(chunksDir);
    writeFileSync(
      entryPath,
      'import { w } from "./chunks/worker-entry_test.mjs";\nexport { w as default };\n',
    );
    writeFileSync(chunkPath, generatedEntry);

    patchSiteEntry(entryPath);

    const patchedChunk = readFileSync(chunkPath, "utf8");
    expect(patchedChunk).toContain("grantpipe-canonical-host-redirect");
    expect(readFileSync(entryPath, "utf8")).not.toContain("grantpipe-canonical-host-redirect");
  });

  it("patches the current Cloudflare adapter index entry", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "grantpipe-site-index-entry-"));
    const entryPath = join(tempRoot, "index.mjs");

    writeFileSync(entryPath, generatedEntry);

    patchSiteEntry(entryPath);

    expect(readFileSync(entryPath, "utf8")).toContain("grantpipe-canonical-host-redirect");
  });

  it("prefers the current Cloudflare adapter index entry over stale entry files", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "grantpipe-site-entry-choice-"));
    const serverDir = join(tempRoot, "dist", "server");
    const originalCwd = process.cwd();

    mkdirSync(serverDir, { recursive: true });
    writeFileSync(join(serverDir, "entry.mjs"), "old entry");
    writeFileSync(join(serverDir, "index.mjs"), "current entry");

    try {
      process.chdir(tempRoot);
      expect(resolveEntryPath()).toBe(join("dist", "server", "index.mjs"));
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("fails loudly when the generated handler shape changes", () => {
    expect(() => patchCanonicalHostRedirect("export default {};")).toThrow(
      "Could not find Cloudflare handler signature",
    );
  });

  it("recognizes relative CLI invocation paths", () => {
    expect(isCliInvocation(["node", "../../scripts/patch-site-canonical-host-redirect.ts"])).toBe(
      true,
    );
  });

  it("api-rewrite block is ordered before host-redirect, path-redirect, static-asset-first, and asset check", () => {
    const patched = patchCanonicalHostRedirect(generatedEntry);

    const apiRewriteIdx = patched.indexOf("grantpipe-api-trailing-slash-rewrite");
    const hostRedirectIdx = patched.indexOf("grantpipe-canonical-host-redirect");
    const pathRedirectIdx = patched.indexOf("grantpipe-canonical-path-redirect");
    const staticAssetIdx = patched.indexOf("grantpipe-static-asset-first");
    const assetCheckIdx = patched.indexOf("app.manifest.assets.has(requestPathname)");

    expect(apiRewriteIdx).toBeGreaterThan(-1);
    expect(apiRewriteIdx).toBeLessThan(hostRedirectIdx);
    expect(hostRedirectIdx).toBeLessThan(pathRedirectIdx);
    expect(pathRedirectIdx).toBeLessThan(staticAssetIdx);
    expect(staticAssetIdx).toBeLessThan(assetCheckIdx);
  });

  it("POST to no-slash api path is internally rewritten and forwarded — not 301-redirected", async () => {
    const patched = patchCanonicalHostRedirect(generatedEntry);

    let renderReceived: Request | null = null;
    const mockApp = {
      manifest: { assets: new Set<string>() },
      render: async (req: Request) => {
        renderReceived = req;
        return new Response("ok", { status: 200 });
      },
    };
    const mockCreateApp = () => mockApp;

    // Build an executable handle function from the patched source.
    // The patched source starts at module top with `const app = createApp();`
    // We inject createApp as a parameter so the factory can bind it.
    const factory = new Function(
      "createApp",
      "Request",
      "Response",
      "URL",
      patched + "\n;return handle;",
    );

    const handle = factory(mockCreateApp, Request, Response, URL) as (
      request: Request,
      env: unknown,
      context: unknown,
    ) => Promise<Response>;

    const mockEnv = {
      ASSETS: {
        fetch: async () => new Response(null, { status: 404 }),
      },
    };

    const postRequest = new Request("https://grantpipe.com/api/ai-sdr/v1/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ test: true }),
    });

    const response = await handle(postRequest, mockEnv, {});

    expect(response.status).not.toBe(301);
    expect(renderReceived).not.toBeNull();
    expect((renderReceived as unknown as Request).method).toBe("POST");
    expect(new URL((renderReceived as unknown as Request).url).pathname).toBe(
      "/api/ai-sdr/v1/sessions/",
    );
  });

  it("GET to non-api no-slash path still returns 301 redirect (regression guard)", async () => {
    const patched = patchCanonicalHostRedirect(generatedEntry);

    const mockApp = {
      manifest: { assets: new Set<string>() },
      render: async (_req: Request) => new Response("page", { status: 200 }),
    };
    const mockCreateApp = () => mockApp;

    const factory = new Function(
      "createApp",
      "Request",
      "Response",
      "URL",
      patched + "\n;return handle;",
    );

    const handle = factory(mockCreateApp, Request, Response, URL) as (
      request: Request,
      env: unknown,
      context: unknown,
    ) => Promise<Response>;

    const mockEnv = {
      ASSETS: {
        fetch: async () => new Response(null, { status: 404 }),
      },
    };

    const getRequest = new Request("https://grantpipe.com/pricing", { method: "GET" });
    const response = await handle(getRequest, mockEnv, {});

    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe("https://grantpipe.com/pricing/");
  });

  it.each([
    ["/grant/management", "https://grantpipe.com/lp/grant-management-software/"],
    ["/grant/management/", "https://grantpipe.com/lp/grant-management-software/"],
    ["/grant/compliance", "https://grantpipe.com/lp/grant-compliance-software/"],
    ["/grant/compliance/", "https://grantpipe.com/lp/grant-compliance-software/"],
    ["/grant/reporting", "https://grantpipe.com/lp/grant-reporting-software/"],
    ["/grant/reporting/", "https://grantpipe.com/lp/grant-reporting-software/"],
    ["/granthub/migration", "https://grantpipe.com/lp/granthub-migration/"],
    ["/granthub/migration/", "https://grantpipe.com/lp/granthub-migration/"],
    ["/restricted/funds", "https://grantpipe.com/lp/restricted-fund-tracking/"],
    ["/restricted/funds/", "https://grantpipe.com/lp/restricted-fund-tracking/"],
  ])("redirects legacy alias %s directly to its final landing page", async (path, target) => {
    const patched = patchCanonicalHostRedirect(generatedEntry);

    const mockApp = {
      manifest: { assets: new Set<string>() },
      render: async (_req: Request) => new Response("page", { status: 200 }),
    };
    const mockCreateApp = () => mockApp;

    const factory = new Function(
      "createApp",
      "Request",
      "Response",
      "URL",
      patched + "\n;return handle;",
    );

    const handle = factory(mockCreateApp, Request, Response, URL) as (
      request: Request,
      env: unknown,
      context: unknown,
    ) => Promise<Response>;

    const mockEnv = {
      ASSETS: {
        fetch: async () => new Response(null, { status: 404 }),
      },
    };

    const request = new Request(`https://grantpipe.com${path}`, { method: "GET" });
    const response = await handle(request, mockEnv, {});

    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe(target);
  });

  it.each([
    ["/signup", "https://app.grantpipe.com/app/signup"],
    ["/signup/", "https://app.grantpipe.com/app/signup"],
    [
      "/signup?utm_source=linkedin&ref=abc",
      "https://app.grantpipe.com/app/signup?utm_source=linkedin&ref=abc",
    ],
    [
      "/signup/?utm_source=linkedin&ref=abc",
      "https://app.grantpipe.com/app/signup?utm_source=linkedin&ref=abc",
    ],
  ])(
    "redirects signup %s to the app subdomain root /signup with attribution preserved",
    async (path, target) => {
      const patched = patchCanonicalHostRedirect(generatedEntry);

      const mockApp = {
        manifest: { assets: new Set<string>() },
        render: async (_req: Request) => new Response("page", { status: 200 }),
      };
      const mockCreateApp = () => mockApp;

      const factory = new Function(
        "createApp",
        "Request",
        "Response",
        "URL",
        patched + "\n;return handle;",
      );

      const handle = factory(mockCreateApp, Request, Response, URL) as (
        request: Request,
        env: unknown,
        context: unknown,
      ) => Promise<Response>;

      // ASSETS.fetch following a cross-host _redirects rule is exactly the loop we
      // must avoid; the worker-level redirect fires before ASSETS is ever touched.
      const mockEnv = {
        ASSETS: {
          fetch: async () => {
            throw new Error("ASSETS.fetch must not be reached for signup redirects");
          },
        },
      };

      const request = new Request(`https://grantpipe.com${path}`, { method: "GET" });
      const response = await handle(request, mockEnv, {});

      expect(response.status).toBe(301);
      expect(response.headers.get("location")).toBe(target);
    },
  );

  it("GET to already-slashed api path is not redirected and render receives correct pathname", async () => {
    const patched = patchCanonicalHostRedirect(generatedEntry);

    let renderReceived: Request | null = null;
    const mockApp = {
      manifest: { assets: new Set<string>() },
      render: async (req: Request) => {
        renderReceived = req;
        return new Response("ok", { status: 200 });
      },
    };
    const mockCreateApp = () => mockApp;

    const factory = new Function(
      "createApp",
      "Request",
      "Response",
      "URL",
      patched + "\n;return handle;",
    );

    const handle = factory(mockCreateApp, Request, Response, URL) as (
      request: Request,
      env: unknown,
      context: unknown,
    ) => Promise<Response>;

    const mockEnv = {
      ASSETS: {
        fetch: async () => new Response(null, { status: 404 }),
      },
    };

    const getRequest = new Request("https://grantpipe.com/api/ai-sdr/context/", { method: "GET" });
    const response = await handle(getRequest, mockEnv, {});

    expect(response.status).not.toBe(301);
    expect(renderReceived).not.toBeNull();
    expect(new URL((renderReceived as unknown as Request).url).pathname).toBe(
      "/api/ai-sdr/context/",
    );
  });
});
