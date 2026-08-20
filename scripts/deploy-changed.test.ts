import { describe, expect, it } from "vitest";
import {
  formatFailure,
  getChangedFilesFromGitOutput,
  getGitDiffCommand,
  isEntrypoint,
  parseArgs,
} from "./deploy-changed";

describe("parseArgs", () => {
  it("uses HEAD@{1}..HEAD by default", () => {
    expect(parseArgs([])).toEqual({
      base: "HEAD@{1}",
      head: "HEAD",
      dryRun: false,
    });
  });

  it("parses dry-run and custom refs", () => {
    expect(parseArgs(["--dry-run", "--base", "master", "--head", "feature"])).toEqual({
      base: "master",
      head: "feature",
      dryRun: true,
    });
  });

  it("rejects missing values for ref flags", () => {
    expect(() => parseArgs(["--base"])).toThrow("Missing value for --base.");
  });

  it("rejects unknown flags", () => {
    expect(() => parseArgs(["--wat"])).toThrow("Unknown argument: --wat");
  });
});

describe("getChangedFilesFromGitOutput", () => {
  it("parses changed files from git diff output", () => {
    expect(getChangedFilesFromGitOutput("apps/api/src/app.ts\napps/web/src/main.tsx\n")).toEqual([
      "apps/api/src/app.ts",
      "apps/web/src/main.tsx",
    ]);
  });

  it("filters blank lines", () => {
    expect(getChangedFilesFromGitOutput("\n\n")).toEqual([]);
  });
});

describe("getGitDiffCommand", () => {
  it("builds the expected git diff command", () => {
    expect(getGitDiffCommand("origin/master", "HEAD")).toBe(
      "git diff --name-only --diff-filter=ACDMR origin/master HEAD",
    );
  });
});

describe("delete-only ranges", () => {
  it("keeps deleted files in the parsed change list", () => {
    expect(getChangedFilesFromGitOutput("packages/ui/src/legacy.ts\n")).toEqual([
      "packages/ui/src/legacy.ts",
    ]);
  });
});

describe("formatFailure", () => {
  it("returns an error message for Error instances", () => {
    expect(formatFailure(new Error("deploy failed"))).toBe("deploy failed");
  });

  it("stringifies non-Error failures", () => {
    expect(formatFailure({ reason: "deploy failed" })).toBe("[object Object]");
  });
});

describe("isEntrypoint", () => {
  it("matches a Windows script path to the current module url", () => {
    expect(
      isEntrypoint(
        "file:///C:/repos/grantpipe/scripts/deploy-changed.ts",
        "C:\\repos\\grantpipe\\scripts\\deploy-changed.ts",
      ),
    ).toBe(true);
  });

  it("returns false when argv entry is missing", () => {
    expect(isEntrypoint("file:///repo/scripts/deploy-changed.ts")).toBe(false);
  });
});
