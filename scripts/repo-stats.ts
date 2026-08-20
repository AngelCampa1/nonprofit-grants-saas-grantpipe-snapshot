/**
 * Prints the size and structure numbers the README cites, so every figure in
 * "By the numbers" can be re-derived instead of trusted.
 *
 * Counting rules, kept deliberately conservative:
 * - Source excludes tests, e2e specs, and generated output (`generated/`, `*.gen.ts`).
 * - The file universe is `git ls-files`, so untracked and ignored trees never inflate a count.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".astro", ".css", ".sql", ".mjs"] as const;

const API_DOMAINS_ROOT = "apps/api/src/domains/";

/** Astro content collections are sourced from this tree, not from apps/site. */
const CONTENT_ROOT = "packages/shared/src/knowledge/marketing/content/";

/** The workspaces that define a `test:coverage` script and emit a json-summary. */
export const COVERAGE_WORKSPACES = [
  "apps/api",
  "apps/site",
  "apps/web",
  "packages/db",
  "packages/shared",
  "packages/ui",
] as const;

export const JSON_REPORT_PATH = "docs/architecture/repo-stats.json";

export type CoverageMetric = {
  lines: number;
  statements: number;
  functions: number;
  branches: number;
};

export type WorkspaceCoverage = {
  workspace: string;
  /** Null when the workspace has no coverage summary on disk yet. */
  coverage: CoverageMetric | null;
};

export type EndpointCounts = {
  get: number;
  post: number;
  put: number;
  patch: number;
  delete: number;
  total: number;
};

export type ChurnStats = {
  insertions: number;
  deletions: number;
};

export type TrackedFileCounts = {
  trackedFiles: number;
  sourceFiles: number;
  testFiles: number;
  unitTestFiles: number;
  componentTestFiles: number;
  e2eSpecFiles: number;
  apiDomains: number;
  migrations: number;
  webRoutes: number;
  contentEntries: number;
};

export type RepoStats = TrackedFileCounts & {
  sourceLines: number;
  testLines: number;
  commits: number;
  firstCommitDate: string;
  lastCommitDate: string;
  dbTables: number;
  dbIndexes: number;
  testCases: number;
  endpoints: EndpointCounts;
  churn: ChurnStats;
  coverage: readonly WorkspaceCoverage[];
};

export type RepoStatsDeps = {
  listTrackedFiles: () => readonly string[];
  countLines: (paths: readonly string[]) => number;
  countSchemaTables: () => number;
  readCommitCount: () => number;
  readCommitDates: () => { first: string; last: string };
  countSchemaIndexes: () => number;
  countEndpoints: () => EndpointCounts;
  countTestCases: (paths: readonly string[]) => number;
  readChurn: () => ChurnStats;
  readCoverage: () => readonly WorkspaceCoverage[];
};

export function isGeneratedFile(filePath: string): boolean {
  return filePath.includes("generated/") || filePath.endsWith(".gen.ts");
}

const TEST_SUFFIXES = [".test.ts", ".test.tsx", ".test.mjs", ".test.js"] as const;

export function isTestFile(filePath: string): boolean {
  return TEST_SUFFIXES.some((suffix) => filePath.endsWith(suffix));
}

export function isE2eSpecFile(filePath: string): boolean {
  return filePath.startsWith("e2e/") && filePath.endsWith(".spec.ts");
}

export function isSourceFile(filePath: string): boolean {
  if (isTestFile(filePath) || filePath.endsWith(".spec.ts") || isGeneratedFile(filePath)) {
    return false;
  }
  return SOURCE_EXTENSIONS.some((extension) => filePath.endsWith(extension));
}

/** A markdown entry backing one of the Astro content collections. */
export function isContentEntry(filePath: string): boolean {
  return filePath.startsWith(CONTENT_ROOT) && filePath.endsWith(".md");
}

export function emptyEndpointCounts(): EndpointCounts {
  return { get: 0, post: 0, put: 0, patch: 0, delete: 0, total: 0 };
}

/**
 * Requires a string-literal path starting with `/` so Hono's context getter
 * (`c.get("db")`) is not mistaken for a route registration. `\s*` spans
 * newlines, which covers routes whose path sits on the following line.
 */
const ENDPOINT_PATTERN = /\.(get|post|put|patch|delete)\(\s*["'`]\//g;

export function countEndpointsInSource(source: string): EndpointCounts {
  const counts = emptyEndpointCounts();
  for (const match of source.matchAll(ENDPOINT_PATTERN)) {
    const method = match[1] as keyof Omit<EndpointCounts, "total">;
    counts[method] += 1;
    counts.total += 1;
  }
  return counts;
}

export function mergeEndpointCounts(all: readonly EndpointCounts[]): EndpointCounts {
  return all.reduce<EndpointCounts>((total, counts) => {
    return {
      get: total.get + counts.get,
      post: total.post + counts.post,
      put: total.put + counts.put,
      patch: total.patch + counts.patch,
      delete: total.delete + counts.delete,
      total: total.total + counts.total,
    };
  }, emptyEndpointCounts());
}

/**
 * Counts `it(` / `test(` declarations including modifier forms (`it.each`,
 * `it.skip`). The lookbehind rules out a preceding dot so `regex.test(value)`
 * is not counted as a test case.
 */
const TEST_CASE_PATTERN = /(?<![.\w$])(?:it|test)(?:\.\w+)*\s*\(/g;

export function countTestCasesInSource(source: string): number {
  return [...source.matchAll(TEST_CASE_PATTERN)].length;
}

export function parseChurn(shortstatOutput: string): ChurnStats {
  const sum = (pattern: RegExp): number =>
    [...shortstatOutput.matchAll(pattern)].reduce((total, m) => total + Number(m[1]), 0);

  return {
    insertions: sum(/(\d+) insertions?\(\+\)/g),
    deletions: sum(/(\d+) deletions?\(-\)/g),
  };
}

/** Reads the four `total` percentages from a vitest/istanbul json-summary. */
export function parseCoverageSummary(raw: string): CoverageMetric | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  const total = (parsed as Record<string, unknown> | null)?.total;
  if (typeof total !== "object" || total === null) return null;

  const pct = (key: string): number | null => {
    const entry = (total as Record<string, unknown>)[key];
    if (typeof entry !== "object" || entry === null) return null;
    const value = (entry as Record<string, unknown>).pct;
    return typeof value === "number" ? value : null;
  };

  const lines = pct("lines");
  const statements = pct("statements");
  const functions = pct("functions");
  const branches = pct("branches");
  if (lines === null || statements === null || functions === null || branches === null) {
    return null;
  }

  return { lines, statements, functions, branches };
}

export function classifyTrackedFiles(files: readonly string[]): TrackedFileCounts {
  const unitTestFiles = files.filter((file) => file.endsWith(".test.ts")).length;
  const componentTestFiles = files.filter((file) => file.endsWith(".test.tsx")).length;

  return {
    trackedFiles: files.length,
    sourceFiles: files.filter(isSourceFile).length,
    testFiles: unitTestFiles + componentTestFiles,
    unitTestFiles,
    componentTestFiles,
    e2eSpecFiles: files.filter(isE2eSpecFile).length,
    // Domain directories, not routes.ts files: one domain (trial-emails) is a
    // scheduled job with a service and no HTTP routes.
    apiDomains: new Set(
      files
        .filter((file) => file.startsWith(API_DOMAINS_ROOT))
        .map((file) => file.slice(API_DOMAINS_ROOT.length).split("/")[0])
        .filter((domain): domain is string => Boolean(domain)),
    ).size,
    migrations: files.filter((file) => file.startsWith("packages/db/") && file.endsWith(".sql"))
      .length,
    webRoutes: files.filter((file) => file.startsWith("apps/web/src/routes/") && isSourceFile(file))
      .length,
    contentEntries: files.filter(isContentEntry).length,
  };
}

export function computeRepoStats(deps: RepoStatsDeps): RepoStats {
  const files = deps.listTrackedFiles();
  const counts = classifyTrackedFiles(files);
  const dates = deps.readCommitDates();
  const testPaths = files.filter((file) => isTestFile(file) || isE2eSpecFile(file));

  return {
    ...counts,
    sourceLines: deps.countLines(files.filter(isSourceFile)),
    testLines: deps.countLines(testPaths),
    commits: deps.readCommitCount(),
    firstCommitDate: dates.first,
    lastCommitDate: dates.last,
    dbTables: deps.countSchemaTables(),
    dbIndexes: deps.countSchemaIndexes(),
    testCases: deps.countTestCases(testPaths),
    endpoints: deps.countEndpoints(),
    churn: deps.readChurn(),
    coverage: deps.readCoverage(),
  };
}

function row(label: string, value: string): string {
  return `  ${label.padEnd(34)}${value}`;
}

function formatEndpoints(endpoints: EndpointCounts): string {
  const n = (value: number) => value.toLocaleString("en-US");
  const breakdown = (["get", "post", "patch", "delete", "put"] as const)
    .filter((method) => endpoints[method] > 0)
    .map((method) => `${n(endpoints[method])} ${method.toUpperCase()}`)
    .join(", ");

  return `${n(endpoints.total)} (${breakdown})`;
}

function formatCoverageRow({ workspace, coverage }: WorkspaceCoverage): string {
  if (coverage === null) return row(workspace, "not measured");

  const pct = (value: number) => `${value.toFixed(1)}%`;
  return row(
    workspace,
    `${pct(coverage.lines)} lines  ${pct(coverage.statements)} stmts  ` +
      `${pct(coverage.functions)} funcs  ${pct(coverage.branches)} branches`,
  );
}

export function formatRepoStats(stats: RepoStats): string {
  const n = (value: number) => value.toLocaleString("en-US");

  return [
    "Scale",
    row("Hand-written source", `${n(stats.sourceLines)} lines in ${n(stats.sourceFiles)} files`),
    row("Test code", `${n(stats.testLines)} lines in ${n(stats.testFiles)} files`),
    row("Tracked files", n(stats.trackedFiles)),
    row("Commits", `${n(stats.commits)} (${stats.firstCommitDate} - ${stats.lastCommitDate})`),
    row("Churn", `${n(stats.churn.insertions)} insertions / ${n(stats.churn.deletions)} deletions`),
    "",
    "Structure",
    row("API domains", n(stats.apiDomains)),
    row("API endpoints", formatEndpoints(stats.endpoints)),
    row("Database tables", n(stats.dbTables)),
    row("Database indexes", n(stats.dbIndexes)),
    row("SQL migrations", n(stats.migrations)),
    row("Web route components", n(stats.webRoutes)),
    row("Marketing content entries", n(stats.contentEntries)),
    row(
      "Unit + integration test files",
      `${n(stats.testFiles)} (${n(stats.unitTestFiles)} .test.ts, ${n(stats.componentTestFiles)} .test.tsx)`,
    ),
    row("Test cases", n(stats.testCases)),
    row("Playwright e2e specs", n(stats.e2eSpecFiles)),
    "",
    "Coverage",
    ...stats.coverage.map(formatCoverageRow),
  ].join("\n");
}

/**
 * Deterministic on purpose: no timestamp, so re-running the script only
 * produces a diff when a real number moved.
 */
export function toJsonReport(stats: RepoStats): string {
  return `${JSON.stringify({ generatedBy: "scripts/repo-stats.ts", stats }, null, 2)}\n`;
}

function git(args: readonly string[]): string {
  return execFileSync("git", [...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trim();
}

export const defaultDeps: RepoStatsDeps = {
  listTrackedFiles: () => git(["ls-files"]).split("\n").filter(Boolean),
  countLines: (paths) =>
    paths.reduce((total, path) => {
      const content = readFileSync(path, "utf8");
      if (content.length === 0) return total;
      const newlines = content.split("\n").length - 1;
      return total + (content.endsWith("\n") ? newlines : newlines + 1);
    }, 0),
  countSchemaTables: () => {
    const files = git(["ls-files", "packages/db/src"])
      .split("\n")
      .filter((file) => file.endsWith(".ts") && !isTestFile(file));
    return files.reduce(
      (total, file) => total + (readFileSync(file, "utf8").match(/pgTable\(/g)?.length ?? 0),
      0,
    );
  },
  readCommitCount: () => Number(git(["rev-list", "--count", "HEAD"])),
  readCommitDates: () => {
    const dates = git(["log", "--reverse", "--format=%ad", "--date=short"]).split("\n");
    return { first: dates[0] ?? "", last: dates[dates.length - 1] ?? "" };
  },
  countSchemaIndexes: () => {
    const files = git(["ls-files", "packages/db/src/schema"])
      .split("\n")
      .filter((file) => file.endsWith(".ts") && !isTestFile(file));
    return files.reduce(
      (total, file) =>
        total + (readFileSync(file, "utf8").match(/\b(?:unique)?[iI]ndex\(/g)?.length ?? 0),
      0,
    );
  },
  countEndpoints: () => {
    const files = git(["ls-files", `${API_DOMAINS_ROOT}`])
      .split("\n")
      .filter((file) => file.endsWith("routes.ts") && !isTestFile(file));
    return mergeEndpointCounts(
      files.map((file) => countEndpointsInSource(readFileSync(file, "utf8"))),
    );
  },
  countTestCases: (paths) =>
    paths.reduce((total, path) => total + countTestCasesInSource(readFileSync(path, "utf8")), 0),
  readChurn: () => parseChurn(git(["log", "--shortstat", "--format="])),
  readCoverage: () =>
    COVERAGE_WORKSPACES.map((workspace) => {
      const summaryPath = `${workspace}/coverage/coverage-summary.json`;
      try {
        return { workspace, coverage: parseCoverageSummary(readFileSync(summaryPath, "utf8")) };
      } catch {
        // No summary on disk: the workspace has not been covered since checkout.
        return { workspace, coverage: null };
      }
    }),
};

export function runCli(deps: {
  log: (message: string) => void;
  computeStats: () => RepoStats;
  argv?: readonly string[];
  writeJson?: (contents: string) => void;
}) {
  const stats = deps.computeStats();
  deps.log(formatRepoStats(stats));

  if (deps.argv?.includes("--json") && deps.writeJson) {
    deps.writeJson(toJsonReport(stats));
    deps.log(`\nWrote ${JSON_REPORT_PATH}`);
  }
}

export function isEntrypoint(argv: readonly string[], moduleUrl: string): boolean {
  const entry = argv[1];
  if (!entry) return false;
  return entry === fileURLToPath(moduleUrl);
}

if (isEntrypoint(process.argv, import.meta.url)) {
  runCli({
    log: (message) => console.log(message),
    computeStats: () => computeRepoStats(defaultDeps),
    argv: process.argv.slice(2),
    writeJson: (contents) => {
      mkdirSync(dirname(JSON_REPORT_PATH), { recursive: true });
      writeFileSync(JSON_REPORT_PATH, contents, "utf8");
    },
  });
}
