import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FEATURE_KNOWLEDGE } from "@grantpipe/shared/knowledge";
import type { FeatureKnowledge } from "@grantpipe/shared/knowledge";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROUTES_DIR = resolve(HERE, "../src/routes/_authenticated");
const ROUTE_TREE = resolve(HERE, "../src/routeTree.gen.ts");

/**
 * Authenticated screens that intentionally have no AI-CS knowledge entry, each
 * with the reason it stays untaught. This list is the escape hatch for the
 * route -> knowledge coverage gate: a teachable screen must either own a
 * FEATURE_KNOWLEDGE entry or appear here. Adding a new screen without doing one
 * of those two things fails the build, which is what keeps AI-CS in sync with
 * the product as it grows.
 */
export const UNTAUGHT_SCREENS: Record<string, string> = {
  "/select-plan":
    "Plan picker in signup and upgrade. Billing plumbing, not a product feature AI-CS teaches.",
  "/confirm-plan":
    "Plan confirmation step after checkout. Billing plumbing, not a product feature.",
  "/onboarding":
    "First-run setup wizard. Self-guiding and transient; AI-CS teaches the features it leads to, not the wizard itself.",
  "/settings/billing":
    "Redirect-only route that forwards to the billing section of /settings, which already has a knowledge entry.",
  "/radar":
    "Redirect-only legacy route that forwards to /deadlines, which has the deadline_radar knowledge entry.",
  "/calendar":
    "Redirect-only legacy route that forwards to /deadlines/calendar, which has the calendar knowledge entry.",
};

/** Entries whose `route` is absent from the generated route tree. */
export function findMissingRoutes(
  entries: Pick<FeatureKnowledge, "key" | "route">[],
  knownRoutes: Set<string>,
): { key: string; route: string }[] {
  return entries
    .filter((e) => !knownRoutes.has(e.route))
    .map((e) => ({ key: e.key, route: e.route }));
}

/** UI labels declared by an entry that do not appear verbatim in its component source. */
export function findMissingLabels(
  entry: Pick<FeatureKnowledge, "uiLabels">,
  source: string,
): string[] {
  return entry.uiLabels.filter((label) => !source.includes(label));
}

/**
 * Extract the set of real route paths from a TanStack `routeTree.gen.ts` source.
 *
 * Both `path:` (bare segment for nested children) and `fullPath:` (the canonical
 * URL) are collected. Nested children register a bare `path:` like `/ledger` while
 * their real URL only appears in `fullPath: '/accounting/ledger'`, so unioning both
 * is what lets a deep entry route resolve.
 */
export function knownRoutesFromTree(treeSource: string): Set<string> {
  const routes = new Set<string>();
  const add = (raw: string): void => {
    const stripped = raw.replace("/_authenticated", "");
    const normalized = stripped.length > 1 ? stripped.replace(/\/$/, "") : stripped;
    routes.add(normalized.startsWith("/") ? normalized : `/${normalized}`);
  };
  for (const match of treeSource.matchAll(/path:\s*['"]([^'"]+)['"]/g)) {
    add(match[1]);
  }
  for (const match of treeSource.matchAll(/fullPath:\s*['"]([^'"]+)['"]/g)) {
    add(match[1]);
  }
  return routes;
}

/**
 * Resolve a route to its component source file.
 *
 * TanStack file routes come in three on-disk shapes, tried in order:
 * 1. directory route — `foo/bar/index.tsx`
 * 2. nested flat route — `foo/bar.tsx`
 * 3. dotted flat route — `foo.bar.tsx` (e.g. `/settings/team` -> `settings.team.tsx`)
 *
 * `exists` is injectable so the resolution order can be unit-tested without disk.
 */
export function routeToSourceFile(
  route: string,
  exists: (path: string) => boolean = existsSync,
): string | null {
  const segments = route.replace(/^\//, "").split("/").filter(Boolean);
  const base = resolve(ROUTES_DIR, ...segments);
  const indexFile = resolve(base, "index.tsx");
  if (exists(indexFile)) return indexFile;
  const flatFile = `${base}.tsx`;
  if (exists(flatFile)) return flatFile;
  const dottedFile = resolve(ROUTES_DIR, `${segments.join(".")}.tsx`);
  if (exists(dottedFile)) return dottedFile;
  return null;
}

/**
 * Resolve the `.lazy.tsx` sibling of a route stub, if one exists.
 *
 * TanStack code-split routes keep a tiny `foo.tsx` stub that registers the route
 * and a `foo.lazy.tsx` that holds the actual component (and its UI labels). The
 * stub imports nothing relative, so the label crawl would never reach the lazy
 * file. Pairing them here is what lets a lazy screen's labels be verified.
 */
export function lazySiblingOf(
  sourceFile: string,
  exists: (path: string) => boolean = existsSync,
): string | null {
  const lazy = sourceFile.replace(/\.tsx$/, ".lazy.tsx");
  return lazy !== sourceFile && exists(lazy) ? lazy : null;
}

/** Extract relative import specifiers (`./x`, `../y`) from a module's source, ignoring package imports. */
export function relativeImportSpecs(source: string): string[] {
  const specs: string[] = [];
  for (const match of source.matchAll(/(?:from|import)\s+['"](\.[^'"]+)['"]/g)) {
    specs.push(match[1]);
  }
  return specs;
}

/** Filesystem seam so the crawl can be unit-tested without touching disk. */
export interface SourceFs {
  read: (path: string) => string;
  exists: (path: string) => boolean;
}

const REAL_FS: SourceFs = {
  read: (path) => readFileSync(path, "utf8"),
  exists: existsSync,
};

/** Resolve a relative import to a real `.tsx`/`.ts` file, trying extensions and `index` files. */
export function resolveLocalImport(
  fromFile: string,
  spec: string,
  fs: SourceFs = REAL_FS,
): string | null {
  const base = resolve(dirname(fromFile), spec);
  const candidates = [
    `${base}.tsx`,
    `${base}.ts`,
    resolve(base, "index.tsx"),
    resolve(base, "index.ts"),
  ];
  return candidates.find((candidate) => fs.exists(candidate)) ?? null;
}

/**
 * Read a route file plus the local component subtree it pulls in, so UI labels that
 * live in wrapper-imported components are still verifiable. Package imports
 * (`@grantpipe/ui`, etc.) are skipped; the crawl is depth-bounded and cycle-safe.
 */
export function collectRouteSource(
  routeFile: string,
  fs: SourceFs = REAL_FS,
  maxDepth = 4,
): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  const visit = (file: string, depth: number): void => {
    if (seen.has(file) || depth > maxDepth) return;
    seen.add(file);
    let source: string;
    try {
      source = fs.read(file);
    } catch {
      return;
    }
    parts.push(source);
    for (const spec of relativeImportSpecs(source)) {
      const resolved = resolveLocalImport(file, spec, fs);
      if (resolved) visit(resolved, depth + 1);
    }
  };
  visit(routeFile, 0);
  return parts.join("\n");
}

/** Normalize a route URL by dropping a non-root trailing slash. */
function normalizeRoute(route: string): string {
  return route.length > 1 ? route.replace(/\/$/, "") : route;
}

/**
 * Convert a TanStack route file path (relative to `_authenticated`, posix slashes)
 * to the URL it serves, or `null` when the file is not a teachable screen.
 *
 * Skipped: `.test.tsx` (tests), `.lazy.tsx` (code-split variants of a sibling
 * route), and any file with a `$` segment (dynamic detail screens — AI-CS teaches
 * the list/feature, not a per-record URL). Dotted flat files like
 * `settings.billing.tsx` expand to nested URLs (`/settings/billing`), and an
 * `index` file collapses to its parent directory.
 */
export function routeFileToUrl(relPath: string): string | null {
  const posix = relPath.replace(/\\/g, "/");
  if (!posix.endsWith(".tsx")) return null;
  if (posix.endsWith(".test.tsx") || posix.endsWith(".lazy.tsx")) return null;
  let rel = posix.replace(/\.tsx$/, "");
  rel = rel.split(".").join("/");
  rel = rel.replace(/\/index$/, "").replace(/^index$/, "");
  const url = normalizeRoute(`/${rel}`);
  if (url.includes("$")) return null;
  return url;
}

/**
 * Walk the authenticated routes directory and return every teachable screen URL.
 * Only files that register a route (`createFileRoute`) count, so helper modules
 * that happen to live under `routes/` are ignored.
 */
export function teachableRoutesFromDisk(routesDir: string = ROUTES_DIR): string[] {
  const urls = new Set<string>();
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      const rel = full.slice(routesDir.length + 1);
      const url = routeFileToUrl(rel);
      if (!url) continue;
      if (!readFileSync(full, "utf8").includes("createFileRoute")) continue;
      urls.add(url);
    }
  };
  walk(routesDir);
  return [...urls].sort();
}

/** Teachable screens that have neither a knowledge entry nor an allowlist reason. */
export function findUncoveredRoutes(
  teachableUrls: string[],
  kbRoutes: Set<string>,
  allowlist: Set<string>,
): string[] {
  const seen = new Set(teachableUrls.map(normalizeRoute));
  return [...seen].filter((u) => !kbRoutes.has(u) && !allowlist.has(u)).sort();
}

/** Allowlist entries that no longer match any teachable screen (stale, should be removed). */
export function findStaleAllowlist(teachableUrls: string[], allowlist: Set<string>): string[] {
  const seen = new Set(teachableUrls.map(normalizeRoute));
  return [...allowlist].filter((entry) => !seen.has(normalizeRoute(entry))).sort();
}

function main(): void {
  const knownRoutes = knownRoutesFromTree(readFileSync(ROUTE_TREE, "utf8"));
  const missingRoutes = findMissingRoutes(FEATURE_KNOWLEDGE, knownRoutes);
  const labelProblems: { key: string; issue: string }[] = [];

  for (const entry of FEATURE_KNOWLEDGE) {
    const sourceFile = routeToSourceFile(entry.route);
    if (!sourceFile) {
      labelProblems.push({ key: entry.key, issue: `no source file found for ${entry.route}` });
      continue;
    }
    let source = collectRouteSource(sourceFile);
    const lazy = lazySiblingOf(sourceFile);
    if (lazy) source += `\n${collectRouteSource(lazy)}`;
    const missing = findMissingLabels(entry, source);
    for (const label of missing) {
      labelProblems.push({ key: entry.key, issue: `label not found in source: "${label}"` });
    }
  }

  const kbRoutes = new Set(FEATURE_KNOWLEDGE.map((e) => normalizeRoute(e.route)));
  const allowlist = new Set(Object.keys(UNTAUGHT_SCREENS));
  const teachable = teachableRoutesFromDisk();
  const uncovered = findUncoveredRoutes(teachable, kbRoutes, allowlist);
  const staleAllowlist = findStaleAllowlist(teachable, allowlist);
  const redundantAllowlist = [...allowlist].filter((r) => kbRoutes.has(normalizeRoute(r))).sort();

  if (
    missingRoutes.length === 0 &&
    labelProblems.length === 0 &&
    uncovered.length === 0 &&
    staleAllowlist.length === 0 &&
    redundantAllowlist.length === 0
  ) {
    console.log(
      `AI-CS knowledge OK: ${FEATURE_KNOWLEDGE.length} screens taught, ` +
        `${allowlist.size} intentionally untaught, ${teachable.length} authenticated screens covered.`,
    );
    return;
  }

  for (const r of missingRoutes) {
    console.error(`Route missing from route tree: ${r.key} -> ${r.route}`);
  }
  for (const p of labelProblems) {
    console.error(`${p.key}: ${p.issue}`);
  }
  for (const route of uncovered) {
    console.error(
      `Authenticated screen has no AI-CS knowledge: ${route}. ` +
        `Add a FEATURE_KNOWLEDGE entry, or list it in UNTAUGHT_SCREENS with a reason.`,
    );
  }
  for (const route of staleAllowlist) {
    console.error(
      `UNTAUGHT_SCREENS lists ${route}, but no such authenticated screen exists. Remove the stale entry.`,
    );
  }
  for (const route of redundantAllowlist) {
    console.error(
      `UNTAUGHT_SCREENS lists ${route}, but it now has a FEATURE_KNOWLEDGE entry. Remove the redundant allowlist entry.`,
    );
  }
  process.exit(1);
}

// Run only when invoked directly, not when imported by tests.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
