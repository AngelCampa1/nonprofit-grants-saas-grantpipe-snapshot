import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const contentPath = resolve(
  process.cwd(),
  "src/knowledge/marketing/content/features/restriction-aware-gl-classification.md",
);

describe("restriction-aware GL classification copy gate", () => {
  it("does not overstate accounting outcomes beyond routing support", () => {
    const source = readFileSync(contentPath, "utf8");

    expect(source).not.toContain("the statement of activities is wrong");
    expect(source).not.toContain("will not reconcile");
    expect(source).not.toContain("must flow through separate accounts");
    expect(source).not.toContain("cannot satisfy either requirement");
    expect(source).not.toContain("must flow through different accounts");
    expect(source).not.toContain("the rule that fired");
  });
});
