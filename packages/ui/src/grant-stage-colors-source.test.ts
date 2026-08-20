import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Locks the grant-stage badge palette intent: `reporting` is a healthy, won,
// active-obligation stage, so it must NOT sit in the warm rose/pink red family
// reserved for negative states (declined / lapsed), and must NOT read as a
// lighter variant of the emerald `active` lane — it sits in the archival-ochre
// accent family. See globals.css gs-reporting comment.
const css = readFileSync(join(process.cwd(), "src/globals.css"), "utf8");

function tokenReference(token: string): string {
  const match = css.match(new RegExp(`--color-${token}:\\s*var\\(--color-([a-z]+-\\d+)\\)`));
  if (!match) throw new Error(`Could not resolve --color-${token} in globals.css`);
  return match[1];
}

describe("grant-stage badge colors", () => {
  it("maps reporting to the archival-ochre accent lane, not a red or green-family hue", () => {
    const reportingBg = tokenReference("gs-reporting");
    const reportingFg = tokenReference("gs-reporting-foreground");

    expect(reportingBg.startsWith("accent-")).toBe(true);
    expect(reportingFg.startsWith("accent-")).toBe(true);
    expect(reportingBg).not.toMatch(/^(pink|rose|red)-/);
    expect(reportingFg).not.toMatch(/^(pink|rose|red)-/);
  });

  it("keeps reporting visually distinct from the emerald active lane", () => {
    const reportingFamily = tokenReference("gs-reporting").replace(/-\d+$/, "");
    const activeFamily = tokenReference("gs-active").replace(/-\d+$/, "");
    expect(reportingFamily).not.toBe(activeFamily);
  });

  it("keeps the red family (rose) exclusively for negative states", () => {
    expect(tokenReference("gs-declined")).toMatch(/^rose-/);
    // reporting (healthy) and declined (negative) must never share a hue family.
    const reportingFamily = tokenReference("gs-reporting").replace(/-\d+$/, "");
    const declinedFamily = tokenReference("gs-declined").replace(/-\d+$/, "");
    expect(reportingFamily).not.toBe(declinedFamily);
  });

  it("no longer defines the retired pink reporting lane", () => {
    expect(css).not.toMatch(/--color-pink-\d+:/);
  });
});
