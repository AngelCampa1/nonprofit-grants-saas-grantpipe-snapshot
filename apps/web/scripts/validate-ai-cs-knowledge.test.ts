import { describe, expect, it } from "vitest";
import {
  collectRouteSource,
  findMissingLabels,
  findMissingRoutes,
  findStaleAllowlist,
  findUncoveredRoutes,
  knownRoutesFromTree,
  lazySiblingOf,
  relativeImportSpecs,
  routeFileToUrl,
  routeToSourceFile,
} from "./validate-ai-cs-knowledge";

const ENTRY = {
  key: "grants",
  route: "/grants",
  uiLabels: ["Add grant", "Grants"],
};

describe("findMissingRoutes", () => {
  it("returns nothing when the route is in the known set", () => {
    expect(findMissingRoutes([ENTRY], new Set(["/grants"]))).toEqual([]);
  });

  it("flags a route absent from the route tree", () => {
    expect(findMissingRoutes([ENTRY], new Set(["/donors"]))).toEqual([
      { key: "grants", route: "/grants" },
    ]);
  });
});

describe("findMissingLabels", () => {
  it("returns nothing when every label appears in the source", () => {
    const source = `<Button>Add grant</Button><h1>Grants</h1>`;
    expect(findMissingLabels(ENTRY, source)).toEqual([]);
  });

  it("flags a label missing from the source", () => {
    const source = `<h1>Grants</h1>`;
    expect(findMissingLabels(ENTRY, source)).toEqual(["Add grant"]);
  });
});

describe("relativeImportSpecs", () => {
  it("collects relative import specifiers and ignores package imports", () => {
    const src = `
      import { PageHeader } from "@grantpipe/ui";
      import { Board } from "../../components/grants/board";
      import { thing } from "./local";
    `;
    expect(relativeImportSpecs(src)).toEqual(["../../components/grants/board", "./local"]);
  });
});

describe("collectRouteSource", () => {
  // The fake FS matches by path suffix so the test is agnostic to how the host
  // OS makes absolute paths (e.g. Windows prepends a drive letter via resolve()).
  const suffixFs = (files: Record<string, string>) => {
    const norm = (p: string) => p.replace(/\\/g, "/");
    const keyFor = (p: string) => Object.keys(files).find((k) => norm(p).endsWith(k));
    return {
      read: (p: string) => {
        const key = keyFor(p);
        if (key === undefined) throw new Error(`no file ${p}`);
        return files[key];
      },
      exists: (p: string) => keyFor(p) !== undefined,
    };
  };

  it("inlines the source of locally imported components so wrapper labels are seen", () => {
    const combined = collectRouteSource(
      "/app/routes/pipeline.tsx",
      suffixFs({
        "/routes/pipeline.tsx": `import { Board } from "./board";\n<h1>Grant Pipeline</h1>`,
        "/routes/board.tsx": `<button>Researching</button>`,
      }),
    );
    expect(combined).toContain("Grant Pipeline");
    expect(combined).toContain("Researching");
  });

  it("does not loop forever on circular imports", () => {
    const combined = collectRouteSource(
      "/app/a.tsx",
      suffixFs({
        "/app/a.tsx": `import { b } from "./b";\nALPHA`,
        "/app/b.tsx": `import { a } from "./a";\nBETA`,
      }),
    );
    expect(combined).toContain("ALPHA");
    expect(combined).toContain("BETA");
  });
});

describe("routeToSourceFile", () => {
  const norm = (p: string) => p.replace(/\\/g, "/");

  it("prefers a directory index file", () => {
    const file = routeToSourceFile("/donors", (p) => norm(p).endsWith("/donors/index.tsx"));
    expect(file && norm(file)).toMatch(/\/donors\/index\.tsx$/);
  });

  it("falls back to a nested flat file", () => {
    const file = routeToSourceFile("/accounting/ledger", (p) =>
      norm(p).endsWith("/accounting/ledger.tsx"),
    );
    expect(file && norm(file)).toMatch(/\/accounting\/ledger\.tsx$/);
  });

  it("resolves a dotted flat route file", () => {
    const file = routeToSourceFile("/settings/team", (p) => norm(p).endsWith("/settings.team.tsx"));
    expect(file && norm(file)).toMatch(/\/settings\.team\.tsx$/);
  });

  it("returns null when no candidate exists", () => {
    expect(routeToSourceFile("/nope", () => false)).toBeNull();
  });
});

describe("routeFileToUrl", () => {
  it("maps a flat route file to its URL", () => {
    expect(routeFileToUrl("accounting/ledger.tsx")).toBe("/accounting/ledger");
  });

  it("collapses an index file to its parent directory", () => {
    expect(routeFileToUrl("donors/index.tsx")).toBe("/donors");
  });

  it("expands a dotted flat file into nested segments", () => {
    expect(routeFileToUrl("settings.billing.tsx")).toBe("/settings/billing");
  });

  it("ignores test, lazy, and dynamic route files", () => {
    expect(routeFileToUrl("donors/index.test.tsx")).toBeNull();
    expect(routeFileToUrl("grants/sentinel.lazy.tsx")).toBeNull();
    expect(routeFileToUrl("donors/$contactId.tsx")).toBeNull();
  });

  it("ignores non-tsx files", () => {
    expect(routeFileToUrl("accounting/ledger.css")).toBeNull();
  });
});

describe("findUncoveredRoutes", () => {
  it("returns nothing when every teachable route is covered or allowlisted", () => {
    const uncovered = findUncoveredRoutes(
      ["/dashboard", "/onboarding", "/grants"],
      new Set(["/dashboard", "/grants"]),
      new Set(["/onboarding"]),
    );
    expect(uncovered).toEqual([]);
  });

  it("flags a teachable route that has neither a knowledge entry nor an allowlist reason", () => {
    const uncovered = findUncoveredRoutes(
      ["/dashboard", "/grants/sentinel"],
      new Set(["/dashboard"]),
      new Set(),
    );
    expect(uncovered).toEqual(["/grants/sentinel"]);
  });

  it("normalizes trailing slashes before comparing", () => {
    expect(findUncoveredRoutes(["/donors/"], new Set(["/donors"]), new Set())).toEqual([]);
  });
});

describe("findStaleAllowlist", () => {
  it("flags an allowlist entry that no longer matches any teachable screen", () => {
    expect(findStaleAllowlist(["/dashboard"], new Set(["/gone"]))).toEqual(["/gone"]);
  });

  it("returns nothing when every allowlist entry still maps to a real screen", () => {
    expect(findStaleAllowlist(["/onboarding"], new Set(["/onboarding"]))).toEqual([]);
  });
});

describe("lazySiblingOf", () => {
  const norm = (p: string) => p.replace(/\\/g, "/");

  it("returns the .lazy.tsx sibling when it exists", () => {
    const sibling = lazySiblingOf("/app/routes/grants/sentinel.tsx", (p) =>
      norm(p).endsWith("/grants/sentinel.lazy.tsx"),
    );
    expect(sibling && norm(sibling)).toMatch(/\/grants\/sentinel\.lazy\.tsx$/);
  });

  it("returns null when there is no lazy sibling", () => {
    expect(lazySiblingOf("/app/routes/grants/index.tsx", () => false)).toBeNull();
  });
});

describe("knownRoutesFromTree", () => {
  it("strips the _authenticated prefix and trailing slash", () => {
    const tree = `path: '/_authenticated/grants/'`;
    expect(knownRoutesFromTree(tree).has("/grants")).toBe(true);
  });

  it("keeps the root path intact", () => {
    expect(knownRoutesFromTree(`path: '/'`).has("/")).toBe(true);
  });

  it("collects multiple distinct routes", () => {
    const tree = `path: '/grants/'\n  path: '/donors/'`;
    const routes = knownRoutesFromTree(tree);
    expect(routes.has("/grants")).toBe(true);
    expect(routes.has("/donors")).toBe(true);
  });

  it("captures canonical fullPath URLs for nested routes whose bare path is only a segment", () => {
    // Nested children store the bare segment in `path:` but the real URL in `fullPath:`.
    const tree = `path: '/ledger'\n  fullPath: '/accounting/ledger'`;
    const routes = knownRoutesFromTree(tree);
    expect(routes.has("/accounting/ledger")).toBe(true);
  });
});
