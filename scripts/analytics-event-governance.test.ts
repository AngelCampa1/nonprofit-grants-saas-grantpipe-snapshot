import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ANALYTICS_EVENTS } from "../packages/shared/src/constants/analytics";
import {
  collectAnalyticsEventLiterals,
  getNonCanonicalAnalyticsEvents,
} from "./analytics-event-governance";

describe("analytics event governance", () => {
  it("keeps emitted analytics event literals canonical or explicitly technical", () => {
    const repoRoot = resolve(import.meta.dirname, "..");
    const events = collectAnalyticsEventLiterals(repoRoot);

    expect(events.length).toBeGreaterThan(150);
    expect(getNonCanonicalAnalyticsEvents(events)).toEqual([]);
  });

  it("keeps the governance scanner focused on analytics capture calls", () => {
    const repoRoot = resolve(import.meta.dirname, "..");
    const eventFilePaths = collectAnalyticsEventLiterals(repoRoot).map((event) =>
      relative(repoRoot, event.filePath).replace(/\\/g, "/"),
    );

    expect(eventFilePaths).toContain("apps/web/src/hooks/use-accounting.ts");
    expect(eventFilePaths).toContain("packages/ui/src/site/components/email-capture.tsx");
  });

  it("uses the shared canonical event registry as the source of truth", () => {
    expect(Object.values(ANALYTICS_EVENTS)).toContain("program_created");
    expect(Object.values(ANALYTICS_EVENTS)).toContain("payment_request_created");
    expect(Object.values(ANALYTICS_EVENTS)).toContain("restriction_term_created");
  });

  it("does not hide unknown durable product events", () => {
    const repoRoot = resolve(import.meta.dirname, "..");
    const sourcePath = resolve(repoRoot, "apps/web/src/hooks/use-programs.ts");
    const source = readFileSync(sourcePath, "utf8");

    expect(source).toContain('captureEvent("program_created"');
    expect(
      getNonCanonicalAnalyticsEvents([
        {
          eventName: "program_created",
          filePath: sourcePath,
          line: source.split("\n").findIndex((line) => line.includes("program_created")) + 1,
        },
      ]),
    ).toEqual([]);
  });
});
