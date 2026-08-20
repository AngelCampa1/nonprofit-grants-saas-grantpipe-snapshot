import { describe, expect, it } from "vitest";
import {
  APP_ROUTE_TARGETS,
  buildIndexMarkdown,
  indexTargets,
  isOverlayRect,
  parseTargets,
  screenshotFileName,
  SKELETON_SELECTOR,
  withDefaults,
} from "./capture-screenshots";

describe("APP_ROUTE_TARGETS", () => {
  it("covers the authenticated surfaces the README points at", () => {
    const paths = APP_ROUTE_TARGETS.map((target) => target.path);

    for (const expected of [
      "/app/dashboard",
      "/app/grants",
      "/app/grants/sentinel",
      "/app/funds",
      "/app/accounting/ledger",
      "/app/accounting/trial-balance",
      "/app/accounting/anomalies",
    ]) {
      expect(paths).toContain(expected);
    }
  });

  it("gives every target a unique name so no capture overwrites another", () => {
    const names = APP_ROUTE_TARGETS.map((target) => target.name);

    expect(new Set(names).size).toBe(names.length);
  });

  it("gives every target a unique path", () => {
    const paths = APP_ROUTE_TARGETS.map((target) => target.path);

    expect(new Set(paths).size).toBe(paths.length);
  });

  it("routes every target through the /app basepath", () => {
    for (const target of APP_ROUTE_TARGETS) {
      expect(target.path.startsWith("/app/")).toBe(true);
    }
  });
});

describe("SKELETON_SELECTOR", () => {
  it("covers both loading-placeholder markers used in the app", () => {
    expect(SKELETON_SELECTOR).toContain(".animate-pulse");
    expect(SKELETON_SELECTOR).toContain('[data-slot="skeleton"]');
  });
});

describe("withDefaults", () => {
  it("fills in the settle wait and full-page flag", () => {
    expect(withDefaults({ path: "/app/dashboard", name: "dashboard" })).toEqual({
      path: "/app/dashboard",
      name: "dashboard",
      wait: 2500,
      full: false,
    });
  });

  it("keeps an explicit override", () => {
    const target = withDefaults({ path: "/app/grants", name: "grants", wait: 6000, full: true });

    expect(target.wait).toBe(6000);
    expect(target.full).toBe(true);
  });
});

describe("parseTargets", () => {
  it("falls back to the built-in route list when no override is given", () => {
    expect(parseTargets(undefined)).toHaveLength(APP_ROUTE_TARGETS.length);
  });

  it("parses an explicit JSON override and applies defaults", () => {
    const targets = parseTargets('[{"path":"/app/funds","name":"funds"}]');

    expect(targets).toEqual([{ path: "/app/funds", name: "funds", wait: 2500, full: false }]);
  });

  it("rejects malformed JSON rather than silently capturing nothing", () => {
    expect(() => parseTargets("{not json")).toThrow(/TARGETS/);
  });

  it("rejects a non-array override", () => {
    expect(() => parseTargets('{"path":"/app/funds"}')).toThrow(/array/);
  });

  it("rejects a target missing a path or name", () => {
    expect(() => parseTargets('[{"name":"funds"}]')).toThrow(/path/);
    expect(() => parseTargets('[{"path":"/app/funds"}]')).toThrow(/name/);
  });
});

describe("screenshotFileName", () => {
  it("appends a png extension", () => {
    expect(screenshotFileName("trial-balance")).toBe("trial-balance.png");
  });

  it("refuses a name that would escape the output directory", () => {
    expect(() => screenshotFileName("../secrets")).toThrow(/name/);
    expect(() => screenshotFileName("nested/path")).toThrow(/name/);
  });
});

describe("isOverlayRect", () => {
  const viewport = { width: 1440, height: 900 };

  it("matches the support launcher pinned to the bottom-right corner", () => {
    const rect = { left: 1330, right: 1420, top: 810, bottom: 880, width: 90, height: 70 };

    expect(isOverlayRect(rect, viewport)).toBe(true);
  });

  it("matches a launcher pinned to the bottom-left corner", () => {
    const rect = { left: 20, right: 110, top: 810, bottom: 880, width: 90, height: 70 };

    expect(isOverlayRect(rect, viewport)).toBe(true);
  });

  it("leaves a full-width sticky footer alone", () => {
    const rect = { left: 0, right: 1440, top: 830, bottom: 900, width: 1440, height: 70 };

    expect(isOverlayRect(rect, viewport)).toBe(false);
  });

  it("leaves a top-anchored header alone", () => {
    const rect = { left: 1330, right: 1420, top: 10, bottom: 70, width: 90, height: 60 };

    expect(isOverlayRect(rect, viewport)).toBe(false);
  });

  it("leaves a zero-sized element alone", () => {
    const rect = { left: 1440, right: 1440, top: 900, bottom: 900, width: 0, height: 0 };

    expect(isOverlayRect(rect, viewport)).toBe(false);
  });

  it("leaves a centred bottom element alone, which is a toast rather than a launcher", () => {
    const rect = { left: 620, right: 820, top: 820, bottom: 880, width: 200, height: 60 };

    expect(isOverlayRect(rect, viewport)).toBe(false);
  });
});

describe("indexTargets", () => {
  it("lists every canonical target whose file is on disk", () => {
    const present = new Set(["dashboard.png", "funds.png"]);

    const result = indexTargets((fileName) => present.has(fileName));

    expect(result.map((target) => target.name)).toEqual(["dashboard", "funds"]);
  });

  it("survives a single-route re-capture without shrinking to one entry", () => {
    // Every canonical file is on disk; a run that only re-shot one route must
    // still produce the full index.
    const result = indexTargets(() => true);

    expect(result).toHaveLength(APP_ROUTE_TARGETS.length);
  });

  it("returns nothing when the archive is empty", () => {
    expect(indexTargets(() => false)).toEqual([]);
  });
});

describe("buildIndexMarkdown", () => {
  const captured = [
    { path: "/app/dashboard", name: "dashboard", wait: 2500, full: false },
    { path: "/app/accounting/ledger", name: "accounting-ledger", wait: 2500, full: false },
  ];

  it("lists one row per captured screenshot", () => {
    const markdown = buildIndexMarkdown(captured);

    expect(markdown).toContain("dashboard.png");
    expect(markdown).toContain("accounting-ledger.png");
    expect(markdown).toContain("/app/dashboard");
  });

  it("embeds each image so the index renders as a contact sheet", () => {
    expect(buildIndexMarkdown(captured)).toContain("![dashboard](dashboard.png)");
  });

  it("records how the archive was produced", () => {
    const markdown = buildIndexMarkdown(captured);

    expect(markdown).toContain("capture-screenshots");
    expect(markdown).toContain("1440");
  });

  it("handles an empty capture list without emitting a broken table", () => {
    expect(buildIndexMarkdown([])).toContain("No screenshots");
  });
});
