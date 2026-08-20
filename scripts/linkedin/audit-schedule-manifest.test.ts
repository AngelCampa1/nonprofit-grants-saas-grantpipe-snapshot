import { describe, expect, it } from "vitest";

import { auditScheduleManifestItems } from "./audit-schedule-manifest";

describe("auditScheduleManifestItems", () => {
  it("runs the shared LinkedIn review gate against manifest text before scheduling", () => {
    expect(() =>
      auditScheduleManifestItems([
        {
          id: "2026-05-21-post-01",
          date: "2026-05-21",
          time: "05:13",
          kind: "post",
          text: "New lead magnet: insert source URL or repo path before publishing.",
          status: "pending",
        },
      ]),
    ).toThrow("LinkedIn post review gate failed");
  });

  it("accepts legacy schedule manifest posts with source file provenance", () => {
    const posts = Array.from({ length: 330 }, (_, index) => ({
      id: `2026-05-21-post-${String(index + 1).padStart(3, "0")}`,
      date: "2026-05-21",
      time: "05:13",
      kind: "post" as const,
      sourceFile: "linkedin-output/2026-05-21/posts.md",
      text: "Award files should keep budgets, amendments, and reports connected.",
      status: "pending" as const,
    }));
    const articles = Array.from({ length: 33 }, (_, index) => ({
      id: `2026-05-21-article-${String(index + 1).padStart(3, "0")}`,
      date: "2026-05-21",
      time: "16:25",
      kind: "article" as const,
      text: "Award files should keep budgets, amendments, and reports connected.",
      status: "pending" as const,
    }));

    expect(auditScheduleManifestItems([...posts, ...articles])).toMatch(/Manifest audit passed/);
  });

  it("fails schedule manifests for posts without claim provenance", () => {
    const posts = Array.from({ length: 330 }, (_, index) => ({
      id: `2026-05-21-post-${String(index + 1).padStart(3, "0")}`,
      date: "2026-05-21",
      time: "05:13",
      kind: "post" as const,
      text: "Award files should keep budgets, amendments, and reports connected.",
      status: "pending" as const,
    }));
    const articles = Array.from({ length: 33 }, (_, index) => ({
      id: `2026-05-21-article-${String(index + 1).padStart(3, "0")}`,
      date: "2026-05-21",
      time: "16:25",
      kind: "article" as const,
      text: "Award files should keep budgets, amendments, and reports connected.",
      status: "pending" as const,
    }));

    expect(() => auditScheduleManifestItems([...posts, ...articles])).toThrow(
      "missing claim_sources",
    );
  });
});
