import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  classifyTrackedFiles,
  computeRepoStats,
  countEndpointsInSource,
  countTestCasesInSource,
  emptyEndpointCounts,
  formatRepoStats,
  isContentEntry,
  isEntrypoint,
  isGeneratedFile,
  isSourceFile,
  isTestFile,
  JSON_REPORT_PATH,
  mergeEndpointCounts,
  parseChurn,
  parseCoverageSummary,
  runCli,
  toJsonReport,
  type RepoStats,
} from "./repo-stats";

describe("isGeneratedFile", () => {
  it("treats a knowledge index under a generated directory as generated", () => {
    expect(isGeneratedFile("packages/shared/src/knowledge/generated/indexes.ts")).toBe(true);
  });

  it("treats a .gen.ts route tree as generated", () => {
    expect(isGeneratedFile("apps/web/src/routeTree.gen.ts")).toBe(true);
  });

  it("does not treat a hand-written service as generated", () => {
    expect(isGeneratedFile("apps/api/src/domains/grants/grant.service.ts")).toBe(false);
  });
});

describe("isTestFile", () => {
  it.each([
    ["packages/shared/src/validators/allocation-math.test.ts", true],
    ["apps/web/src/routes/dashboard.test.tsx", true],
    // A test file that happens to be plain ESM rather than TypeScript.
    ["apps/web/scripts/coverage-command-contract.test.mjs", true],
    ["e2e/auth-onboarding.spec.ts", false],
    ["apps/api/src/domains/grants/grant.service.ts", false],
  ])("classifies %s as test=%s", (filePath, expected) => {
    expect(isTestFile(filePath)).toBe(expected);
  });
});

describe("isSourceFile", () => {
  it("counts hand-written TypeScript, Astro, CSS and SQL as source", () => {
    for (const filePath of [
      "apps/api/src/domains/grants/grant.service.ts",
      "apps/web/src/routes/dashboard.tsx",
      "apps/site/src/pages/books.astro",
      "apps/site/src/styles/global.css",
      "packages/db/migrations/0001_init.sql",
      "scripts/deploy-api.mjs",
    ]) {
      expect(isSourceFile(filePath)).toBe(true);
    }
  });

  it("excludes tests, specs, generated output and unrelated extensions", () => {
    for (const filePath of [
      "packages/shared/src/validators/allocation-math.test.ts",
      "apps/web/src/routes/dashboard.test.tsx",
      "e2e/auth-onboarding.spec.ts",
      "apps/web/src/routeTree.gen.ts",
      "packages/shared/src/knowledge/generated/indexes.ts",
      "apps/web/scripts/coverage-command-contract.test.mjs",
      "README.md",
      "docs/screenshots/dashboard.png",
    ]) {
      expect(isSourceFile(filePath)).toBe(false);
    }
  });
});

describe("classifyTrackedFiles", () => {
  const files = [
    "apps/api/src/domains/grants/routes.ts",
    "apps/api/src/domains/grants/grant.service.ts",
    "apps/api/src/domains/funds/routes.ts",
    "apps/web/src/routes/_authenticated/dashboard.tsx",
    "apps/web/src/routes/_authenticated/dashboard.test.tsx",
    "apps/web/src/routeTree.gen.ts",
    "packages/db/migrations/0001_init.sql",
    "packages/db/migrations/0002_grants.sql",
    "packages/shared/src/validators/allocation-math.ts",
    "packages/shared/src/validators/allocation-math.test.ts",
    "e2e/auth-onboarding.spec.ts",
    "README.md",
  ];

  it("counts source, test and e2e files with generated output excluded", () => {
    const counts = classifyTrackedFiles(files);

    expect(counts.trackedFiles).toBe(12);
    expect(counts.sourceFiles).toBe(7);
    expect(counts.unitTestFiles).toBe(1);
    expect(counts.componentTestFiles).toBe(1);
    expect(counts.testFiles).toBe(2);
    expect(counts.e2eSpecFiles).toBe(1);
  });

  it("derives structural counts from tracked paths", () => {
    const counts = classifyTrackedFiles(files);

    expect(counts.apiDomains).toBe(2);
    expect(counts.migrations).toBe(2);
    expect(counts.webRoutes).toBe(1);
  });

  it("counts a service-only domain that exposes no HTTP routes", () => {
    // trial-emails is a scheduled job: a service with no routes.ts.
    const counts = classifyTrackedFiles([...files, "apps/api/src/domains/trial-emails/service.ts"]);

    expect(counts.apiDomains).toBe(3);
  });
});

describe("computeRepoStats", () => {
  const files = [
    "apps/api/src/domains/grants/routes.ts",
    "apps/web/src/routes/_authenticated/dashboard.tsx",
    "apps/web/src/routes/_authenticated/dashboard.test.tsx",
    "apps/web/src/routeTree.gen.ts",
    "packages/db/migrations/0001_init.sql",
    "e2e/auth-onboarding.spec.ts",
  ];

  const deps = {
    listTrackedFiles: () => files,
    countLines: (paths: readonly string[]) => paths.length * 100,
    countSchemaTables: () => 115,
    readCommitCount: () => 4261,
    readCommitDates: () => ({ first: "2026-04-07", last: "2026-08-05" }),
    countSchemaIndexes: () => 167,
    countEndpoints: () => ({ get: 135, post: 128, put: 6, patch: 52, delete: 42, total: 363 }),
    countTestCases: (paths: readonly string[]) => paths.length * 7,
    readChurn: () => ({ insertions: 3_754_257, deletions: 412_131 }),
    readCoverage: () => [
      {
        workspace: "apps/api",
        coverage: { lines: 98.1, statements: 98.2, functions: 97.3, branches: 95.4 },
      },
      { workspace: "packages/db", coverage: null },
    ],
  };

  it("sums source lines over non-test, non-generated files only", () => {
    const stats = computeRepoStats(deps);

    // routes.ts + dashboard.tsx + 0001_init.sql = 3 source files
    expect(stats.sourceFiles).toBe(3);
    expect(stats.sourceLines).toBe(300);
  });

  it("counts test lines across unit, component and e2e specs", () => {
    const stats = computeRepoStats(deps);

    expect(stats.testFiles).toBe(1);
    expect(stats.e2eSpecFiles).toBe(1);
    expect(stats.testLines).toBe(200);
  });

  it("passes through git history and schema facts", () => {
    const stats = computeRepoStats(deps);

    expect(stats.commits).toBe(4261);
    expect(stats.firstCommitDate).toBe("2026-04-07");
    expect(stats.lastCommitDate).toBe("2026-08-05");
    expect(stats.dbTables).toBe(115);
  });

  it("never counts a generated file as source", () => {
    const stats = computeRepoStats(deps);

    expect(stats.sourceLines).not.toBe(400);
  });

  it("passes through endpoint, index and churn facts", () => {
    const stats = computeRepoStats(deps);

    expect(stats.endpoints.total).toBe(363);
    expect(stats.endpoints.get).toBe(135);
    expect(stats.dbIndexes).toBe(167);
    expect(stats.churn).toEqual({ insertions: 3_754_257, deletions: 412_131 });
  });

  it("counts test cases over test and e2e files only", () => {
    const stats = computeRepoStats(deps);

    // dashboard.test.tsx + auth-onboarding.spec.ts = 2 files x 7
    expect(stats.testCases).toBe(14);
  });

  it("keeps a workspace with no coverage summary as an explicit null", () => {
    const stats = computeRepoStats(deps);

    expect(stats.coverage).toHaveLength(2);
    expect(stats.coverage[0]?.coverage?.lines).toBe(98.1);
    expect(stats.coverage[1]?.coverage).toBeNull();
  });
});

describe("isContentEntry", () => {
  it("counts a marketing knowledge markdown entry", () => {
    expect(
      isContentEntry("packages/shared/src/knowledge/marketing/content/guides/cost-allocation.md"),
    ).toBe(true);
  });

  it("ignores knowledge files outside the content collections", () => {
    expect(isContentEntry("packages/shared/src/knowledge/marketing/forbidden-patterns.ts")).toBe(
      false,
    );
  });

  it("ignores markdown elsewhere in the repo", () => {
    expect(isContentEntry("docs/engineering.md")).toBe(false);
  });
});

describe("countEndpointsInSource", () => {
  it("counts one entry per HTTP verb registered against a literal path", () => {
    const source = [
      "const routes = app",
      '  .get("/", listGrants)',
      '  .post("/", createGrant)',
      '  .patch("/:grantId", updateGrant)',
      '  .delete("/:grantId", deleteGrant);',
    ].join("\n");

    expect(countEndpointsInSource(source)).toEqual({
      get: 1,
      post: 1,
      put: 0,
      patch: 1,
      delete: 1,
      total: 4,
    });
  });

  it("ignores Hono context getters, which share the .get name", () => {
    // c.get("db") reads request context; it is not a route registration.
    const source = 'const db = c.get("db");\nconst org = c.get("orgId");';

    expect(countEndpointsInSource(source)).toEqual(emptyEndpointCounts());
  });

  it("counts a route whose path sits on the next line", () => {
    const source = 'app.get(\n  "/spend-down",\n  handler,\n);';

    expect(countEndpointsInSource(source).get).toBe(1);
  });

  it("merges counts across files", () => {
    const a = countEndpointsInSource('app.get("/a", h)');
    const b = countEndpointsInSource('app.get("/b", h).post("/b", h)');

    expect(mergeEndpointCounts([a, b])).toEqual({
      get: 2,
      post: 1,
      put: 0,
      patch: 0,
      delete: 0,
      total: 3,
    });
  });
});

describe("countTestCasesInSource", () => {
  it("counts plain it and test declarations", () => {
    const source = 'it("a", () => {});\ntest("b", () => {});';

    expect(countTestCasesInSource(source)).toBe(2);
  });

  it("counts modifier forms such as it.each and it.skip", () => {
    const source =
      'it.each([1])("a", () => {});\nit.skip("b", () => {});\ntest.only("c", () => {});';

    expect(countTestCasesInSource(source)).toBe(3);
  });

  it("does not count a regex .test( method call", () => {
    // The regex API shares the `test` name; a preceding dot rules it out.
    const source = "if (/^a/.test(value)) return;";

    expect(countTestCasesInSource(source)).toBe(0);
  });

  it("does not count describe blocks", () => {
    expect(countTestCasesInSource('describe("group", () => {});')).toBe(0);
  });
});

describe("parseChurn", () => {
  it("sums insertions and deletions across shortstat lines", () => {
    const output = [
      " 3 files changed, 10 insertions(+), 2 deletions(-)",
      " 1 file changed, 5 insertions(+)",
      " 2 files changed, 7 deletions(-)",
    ].join("\n");

    expect(parseChurn(output)).toEqual({ insertions: 15, deletions: 9 });
  });

  it("returns zeroes for empty history", () => {
    expect(parseChurn("")).toEqual({ insertions: 0, deletions: 0 });
  });
});

describe("parseCoverageSummary", () => {
  it("reads the four totals a coverage summary reports", () => {
    const raw = JSON.stringify({
      total: {
        lines: { pct: 96.5 },
        statements: { pct: 96.4 },
        functions: { pct: 94.2 },
        branches: { pct: 91.8 },
      },
    });

    expect(parseCoverageSummary(raw)).toEqual({
      lines: 96.5,
      statements: 96.4,
      functions: 94.2,
      branches: 91.8,
    });
  });

  it("returns null for malformed JSON rather than throwing", () => {
    expect(parseCoverageSummary("{not json")).toBeNull();
  });

  it("returns null when the totals block is missing", () => {
    expect(parseCoverageSummary(JSON.stringify({ "src/a.ts": {} }))).toBeNull();
  });
});

const sampleStats: RepoStats = {
  sourceLines: 267727,
  sourceFiles: 1060,
  testLines: 387449,
  testFiles: 903,
  unitTestFiles: 684,
  componentTestFiles: 219,
  e2eSpecFiles: 13,
  trackedFiles: 5910,
  commits: 4261,
  firstCommitDate: "2026-04-07",
  lastCommitDate: "2026-08-05",
  apiDomains: 37,
  dbTables: 115,
  migrations: 95,
  webRoutes: 88,
  dbIndexes: 167,
  testCases: 18270,
  contentEntries: 1526,
  endpoints: { get: 135, post: 128, put: 6, patch: 52, delete: 42, total: 363 },
  churn: { insertions: 3754257, deletions: 412131 },
  coverage: [
    {
      workspace: "apps/api",
      coverage: { lines: 98.11, statements: 98.2, functions: 97.3, branches: 95.44 },
    },
    { workspace: "packages/db", coverage: null },
  ],
};

describe("formatRepoStats", () => {
  it("renders every headline number the README cites", () => {
    const output = formatRepoStats(sampleStats);

    for (const expected of [
      "267,727",
      "387,449",
      "903",
      "13",
      "5,910",
      "4,261",
      "2026-04-07",
      "2026-08-05",
      "37",
      "115",
      "95",
      "88",
    ]) {
      expect(output).toContain(expected);
    }
  });

  it("labels the scale, structure and coverage groups", () => {
    const output = formatRepoStats(sampleStats);

    expect(output).toContain("Scale");
    expect(output).toContain("Structure");
    expect(output).toContain("Coverage");
  });

  it("renders the endpoint breakdown by verb", () => {
    const output = formatRepoStats(sampleStats);

    expect(output).toContain("363");
    expect(output).toContain("135 GET");
  });

  it("renders churn, indexes, test cases and content entries", () => {
    const output = formatRepoStats(sampleStats);

    expect(output).toContain("3,754,257");
    expect(output).toContain("412,131");
    expect(output).toContain("167");
    expect(output).toContain("18,270");
    expect(output).toContain("1,526");
  });

  it("rounds coverage to one decimal and marks a workspace with no summary", () => {
    const output = formatRepoStats(sampleStats);

    expect(output).toContain("98.1");
    expect(output).toContain("apps/api");
    expect(output).toMatch(/packages\/db\s+not measured/);
  });
});

describe("toJsonReport", () => {
  it("round-trips through JSON with the coverage rows intact", () => {
    const parsed = JSON.parse(toJsonReport(sampleStats)) as {
      generatedBy: string;
      stats: RepoStats;
    };

    expect(parsed.generatedBy).toContain("repo-stats");
    expect(parsed.stats.endpoints.total).toBe(363);
    expect(parsed.stats.coverage[1]?.coverage).toBeNull();
  });

  it("ends with a trailing newline so the file is diff-friendly", () => {
    expect(toJsonReport(sampleStats).endsWith("\n")).toBe(true);
  });
});

describe("runCli", () => {
  it("prints the formatted stats", () => {
    const log = vi.fn();

    runCli({ log, computeStats: () => sampleStats });

    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]?.[0]).toContain("Scale");
  });

  it("writes the JSON report only when --json is passed", () => {
    const writeJson = vi.fn();

    runCli({ log: vi.fn(), computeStats: () => sampleStats, argv: [], writeJson });

    expect(writeJson).not.toHaveBeenCalled();
  });

  it("writes the JSON report when --json is passed", () => {
    const writeJson = vi.fn();
    const log = vi.fn();

    runCli({ log, computeStats: () => sampleStats, argv: ["--json"], writeJson });

    expect(writeJson).toHaveBeenCalledTimes(1);
    expect(writeJson.mock.calls[0]?.[0]).toContain('"generatedBy"');
    expect(log.mock.calls[1]?.[0]).toContain(JSON_REPORT_PATH);
  });
});

describe("isEntrypoint", () => {
  // Built from real absolute paths so the URL is valid on both POSIX and Windows.
  const modulePath = resolve("scripts/repo-stats.ts");
  const moduleUrl = pathToFileURL(modulePath).href;

  it("is true when the module is the script node was asked to run", () => {
    expect(isEntrypoint(["node", modulePath], moduleUrl)).toBe(true);
  });

  it("is false when the module is only imported by another entrypoint", () => {
    expect(isEntrypoint(["node", resolve("scripts/other.ts")], moduleUrl)).toBe(false);
  });

  it("is false when node was given no script argument", () => {
    expect(isEntrypoint(["node"], moduleUrl)).toBe(false);
  });
});
