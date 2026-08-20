import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = dirname(dirname(SCRIPT_PATH));

const PATCH_MARKER = "grantpipe-canonical-host-redirect";
const STATIC_ASSET_MARKER = "grantpipe-static-asset-first";
const HANDLE_SIGNATURE = "async function handle(request, env, context) {";
const REQUEST_PATHNAME_LINE = "  const { pathname: requestPathname } = new URL(request.url);";

function insertStaticAssetFirst(source: string): string {
  if (source.includes(STATIC_ASSET_MARKER)) return source;

  const requestPathnameIndex = source.indexOf(REQUEST_PATHNAME_LINE);
  if (requestPathnameIndex === -1) {
    throw new Error("Could not find Cloudflare request pathname line in generated site entry.");
  }

  const staticAssetBlock = `  // ${STATIC_ASSET_MARKER}
  const assetUrl = new URL(request.url);
  if (assetUrl.pathname.endsWith("/")) {
    assetUrl.pathname += "index.html";
  } else {
    assetUrl.pathname = assetUrl.pathname.replace(/index.html$/, "").replace(/\\.html$/, "");
  }
  const canonicalAsset = await env.ASSETS.fetch(assetUrl);
  if (canonicalAsset.status !== 404) {
    return canonicalAsset;
  }
`;

  return `${source.slice(0, requestPathnameIndex)}${staticAssetBlock}${source.slice(
    requestPathnameIndex,
  )}`;
}

export function patchCanonicalHostRedirect(source: string): string {
  if (source.includes(PATCH_MARKER)) return insertStaticAssetFirst(source);

  const signatureIndex = source.indexOf(HANDLE_SIGNATURE);
  if (signatureIndex === -1) {
    throw new Error("Could not find Cloudflare handler signature in generated site entry.");
  }

  const insertIndex = signatureIndex + HANDLE_SIGNATURE.length;
  const redirectBlock = `
  // grantpipe-api-trailing-slash-rewrite
  const apiRewriteUrl = new URL(request.url);
  if (
    apiRewriteUrl.pathname.startsWith("/api/") &&
    !apiRewriteUrl.pathname.endsWith("/") &&
    !apiRewriteUrl.pathname.split("/").pop()?.includes(".")
  ) {
    apiRewriteUrl.pathname += "/";
    request = new Request(apiRewriteUrl, request);
  }
  // ${PATCH_MARKER}
  const canonicalHostUrl = new URL(request.url);
  if (canonicalHostUrl.hostname === "www.grantpipe.com") {
    canonicalHostUrl.hostname = "grantpipe.com";
    return Response.redirect(canonicalHostUrl, 301);
  }
  // grantpipe-legacy-alias-redirect
  const legacyAliasRedirects = {
    "/grant/management": "/lp/grant-management-software/",
    "/grant/compliance": "/lp/grant-compliance-software/",
    "/grant/reporting": "/lp/grant-reporting-software/",
    "/granthub/migration": "/lp/granthub-migration/",
    "/restricted/funds": "/lp/restricted-fund-tracking/",
  };
  const legacyAliasPath =
    canonicalHostUrl.pathname === "/"
      ? canonicalHostUrl.pathname
      : canonicalHostUrl.pathname.replace(/\\/$/, "");
  const legacyAliasTarget = legacyAliasRedirects[legacyAliasPath];
  if (legacyAliasTarget) {
    canonicalHostUrl.pathname = legacyAliasTarget;
    return Response.redirect(canonicalHostUrl, 301);
  }
  // grantpipe-signup-redirect
  // Signup lives on the app subdomain, not the marketing site. Redirect at the
  // worker boundary (a direct cross-host 301) instead of via _redirects: an
  // _redirects cross-host rule is honored inside env.ASSETS.fetch and loops
  // forever (TypeError: Too many redirects -> HTTP 500). The query string is
  // copied onto the destination so UTM/click attribution is preserved.
  const signupNormalizedPath =
    canonicalHostUrl.pathname === "/"
      ? canonicalHostUrl.pathname
      : canonicalHostUrl.pathname.replace(/\\/$/, "");
  if (signupNormalizedPath === "/signup") {
    const signupRedirectUrl = new URL("https://app.grantpipe.com/app/signup");
    signupRedirectUrl.search = canonicalHostUrl.search;
    return Response.redirect(signupRedirectUrl.toString(), 301);
  }
  // grantpipe-canonical-path-redirect
  const canonicalPathname = canonicalHostUrl.pathname;
  if (
    canonicalPathname !== "/" &&
    canonicalPathname !== "/robots.txt" &&
    canonicalPathname !== "/llms.txt" &&
    canonicalPathname !== "/llms-full.txt" &&
    canonicalPathname !== "/pricing.txt" &&
    canonicalPathname !== "/rss.xml" &&
    canonicalPathname !== "/sitemap.xml" &&
    canonicalPathname !== "/sitemap-index.xml" &&
    canonicalPathname !== "/signup-flow.json" &&
    !canonicalHostUrl.pathname.endsWith("/") &&
    !canonicalHostUrl.pathname.split("/").pop()?.includes(".")
  ) {
    canonicalHostUrl.pathname += "/";
    return Response.redirect(canonicalHostUrl, 301);
  }
  // grantpipe-static-asset-first
  const assetUrl = new URL(request.url);
  if (assetUrl.pathname.endsWith("/")) {
    assetUrl.pathname += "index.html";
  } else {
    assetUrl.pathname = assetUrl.pathname.replace(/index.html$/, "").replace(/\\.html$/, "");
  }
  const canonicalAsset = await env.ASSETS.fetch(assetUrl);
  if (canonicalAsset.status !== 404) {
    return canonicalAsset;
  }`;

  return insertStaticAssetFirst(
    `${source.slice(0, insertIndex)}${redirectBlock}${source.slice(insertIndex)}`,
  );
}

export function patchSiteEntry(entryPath: string): void {
  const source = readFileSync(entryPath, "utf8");
  const targetPath = source.includes(HANDLE_SIGNATURE)
    ? entryPath
    : resolveImportedWorkerEntry(entryPath, source);
  const targetSource = readFileSync(targetPath, "utf8");
  const patched = patchCanonicalHostRedirect(targetSource);
  if (patched !== targetSource) {
    writeFileSync(targetPath, patched);
  }
}

export function resolveImportedWorkerEntry(entryPath: string, source: string): string {
  const match = source.match(/import\s+\{\s*\w+\s*\}\s+from\s+"(\.\/chunks\/[^"]+)";/);

  if (!match) {
    throw new Error("Could not find Cloudflare handler signature in generated site entry.");
  }

  const importedEntryPath = join(dirname(entryPath), match[1]);
  if (!existsSync(importedEntryPath)) {
    throw new Error(`Imported Cloudflare handler chunk not found: ${importedEntryPath}`);
  }

  return importedEntryPath;
}

export function resolveEntryPath(): string {
  const entryFileNames = ["index.mjs", "entry.mjs"];
  for (const entryFileName of entryFileNames) {
    const localEntry = join("dist", "server", entryFileName);
    if (existsSync(localEntry)) return localEntry;

    const repoEntry = join("apps", "site", "dist", "server", entryFileName);
    if (existsSync(repoEntry)) return repoEntry;

    const scriptRelativeRepoEntry = join(
      REPO_ROOT,
      "apps",
      "site",
      "dist",
      "server",
      entryFileName,
    );
    if (existsSync(scriptRelativeRepoEntry)) return scriptRelativeRepoEntry;
  }

  throw new Error("Generated site entry not found. Run the site build first.");
}

export function isCliInvocation(argv = process.argv): boolean {
  return Boolean(argv[1] && SCRIPT_PATH === resolve(argv[1]));
}

export function runCli(argv = process.argv): void {
  if (!isCliInvocation(argv)) return;

  const entryPath = resolveEntryPath();
  patchSiteEntry(entryPath);
  console.log(`Patched canonical host redirect in ${entryPath}`);
}

runCli();
