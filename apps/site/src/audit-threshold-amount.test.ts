import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// fileURLToPath yields a native path ("C:\\..." on Windows). Using URL.pathname
// would prepend a leading slash ("/C:/...") that is rejected as a spawn cwd.
const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const retiredAuditThresholdVariants = [
  ["$750", "000"].join(","),
  ["$750", "k"].join(""),
  ["750", "k"].join(""),
  ["single-audit-threshold-", "750", "k"].join(""),
];

// The single-audit YouTube video and the Uniform Guidance explainer both teach
// the 2024 threshold change, so they must show the retired figure struck through
// against the current one-million number. These are intentional historical
// references, not stale current-value claims.
const intentionalHistoricalReferencePrefixes = [
  "docs/youtube/video-03-single-audit/",
  "docs/youtube/video-s4-uniform-guidance/",
  // Rendered _publish copies of the two videos above teach the same 2024
  // threshold change, so they carry the retired figure for the same reason.
  "docs/youtube/_publish/vid03.txt",
  "docs/youtube/_publish/s4.txt",
];

function filesReferencingRetiredThreshold(): string[] {
  try {
    return execFileSync(
      "git",
      [
        "grep",
        "-Ilz",
        "-i",
        "-F",
        ...retiredAuditThresholdVariants.flatMap((variant) => ["-e", variant]),
        "--",
        ".",
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
      },
    )
      .split("\0")
      .filter(Boolean)
      .filter(
        (file) => !intentionalHistoricalReferencePrefixes.some((prefix) => file.startsWith(prefix)),
      );
  } catch (error) {
    if (typeof error === "object" && error !== null && "status" in error && error.status === 1) {
      return [];
    }

    throw error;
  }
}

describe("audit threshold amount", () => {
  // Scans every tracked file, so allow ample time under parallel load.
  it("does not keep references to the retired audit threshold", () => {
    const offenders = filesReferencingRetiredThreshold();

    expect(
      offenders,
      `Files still referencing the retired audit threshold:\n${offenders.join("\n")}`,
    ).toEqual([]);
  }, 30000);
});
