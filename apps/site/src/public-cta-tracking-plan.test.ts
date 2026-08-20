import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const trackingPlanPath = resolve(process.cwd(), "../../docs/analytics/posthog-tracking-plan.md");

describe("public CTA tracking plan", () => {
  it("marks shared public-site CTA click tracking as implemented", () => {
    const plan = readFileSync(trackingPlanPath, "utf8");

    // Collapse runs of spaces so the assertion is robust to markdown table
    // column-alignment padding (Prettier re-pads cells when adjacent rows grow).
    const normalized = plan.replace(/ +/g, " ");

    expect(normalized).toContain(
      "| Public site CTAs | Implemented with shared `.gp-mkt-btn` detection, signup attribution, and CTA context metadata",
    );
  });

  it("does not leave the completed analytics audit section labeled as a current gap backlog", () => {
    const plan = readFileSync(trackingPlanPath, "utf8");

    expect(plan).toContain("## Resolved Coverage Audit");
    expect(plan).not.toContain("## Current Gap Backlog");
    expect(plan).not.toContain("| Missing coverage");
  });
});
