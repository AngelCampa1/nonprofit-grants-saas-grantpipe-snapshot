import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { GRANTPIPE_OS_BOILERPLATE } from "@grantpipe/shared";
import { formatCliResult, parseArgs, rewriteOsPositioning } from "./rewrite-os-positioning";

function makeTempContentRoot(): string {
  return mkdtempSync(join(tmpdir(), "grantpipe-os-positioning-"));
}

function writeMarkdown(root: string, collection: string, name: string, source: string): string {
  const dir = join(root, collection);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, name);
  writeFileSync(path, source, "utf8");
  return path;
}

describe("rewriteOsPositioning", () => {
  it("updates eligible markdown body copy in dry-run mode without writing files", () => {
    const root = makeTempContentRoot();
    const path = writeMarkdown(
      root,
      "guides",
      "sample.md",
      [
        "---",
        'title: "Sample"',
        'schema: "Article"',
        "---",
        "",
        "GrantPipe is donor management and grant compliance software for mid-sized nonprofits.",
      ].join("\n"),
    );

    const result = rewriteOsPositioning({ contentRoot: root, collection: "guides", dryRun: true });

    expect(result.changed).toEqual([path]);
    expect(result.written).toEqual([]);
    expect(readFileSync(path, "utf8")).toContain(
      "GrantPipe is donor management and grant compliance software",
    );
  });

  it("writes idempotent positioning while preserving protected frontmatter", () => {
    const root = makeTempContentRoot();
    const path = writeMarkdown(
      root,
      "pricing-breakdowns",
      "sample.md",
      [
        "---",
        'title: "Sample"',
        "competitor:",
        '  pricing: "$60-$165/user/mo"',
        "sourceUrls:",
        '  - "https://example.com/pricing"',
        'verifiedAt: "2026-05-01"',
        'schema: "Article"',
        "---",
        "",
        "GrantPipe is donor management and grant compliance software for mid-sized nonprofits.",
      ].join("\n"),
    );

    const first = rewriteOsPositioning({
      contentRoot: root,
      collection: "pricing-breakdowns",
      dryRun: false,
    });
    const second = rewriteOsPositioning({
      contentRoot: root,
      collection: "pricing-breakdowns",
      dryRun: false,
    });
    const updated = readFileSync(path, "utf8");

    expect(first.written).toEqual([path]);
    expect(second.changed).toEqual([]);
    expect(updated).toContain('pricing: "$60-$165/user/mo"');
    expect(updated).toContain("sourceUrls:");
    expect(updated).toContain('verifiedAt: "2026-05-01"');
    expect(updated).toContain('schema: "Article"');
    expect(updated).toContain(GRANTPIPE_OS_BOILERPLATE);
  });

  it("limits rewriting to the requested collection", () => {
    const root = makeTempContentRoot();
    writeMarkdown(
      root,
      "guides",
      "sample.md",
      '---\ntitle: "Guide"\n---\n\nGrantPipe is donor management and grant compliance software.',
    );
    const otherPath = writeMarkdown(
      root,
      "glossary",
      "sample.md",
      '---\ntitle: "Glossary"\n---\n\nGrantPipe is donor management and grant compliance software.',
    );

    const result = rewriteOsPositioning({ contentRoot: root, collection: "guides", dryRun: false });

    expect(result.scanned).toBe(1);
    expect(result.written).toHaveLength(1);
    expect(readFileSync(otherPath, "utf8")).toContain(
      "GrantPipe is donor management and grant compliance software.",
    );
  });

  it("returns an empty result for missing collections", () => {
    const root = makeTempContentRoot();

    const result = rewriteOsPositioning({
      contentRoot: root,
      collection: "guides",
      dryRun: false,
    });

    expect(result).toEqual({ scanned: 0, changed: [], written: [] });
  });

  it("rejects collection path traversal", () => {
    const root = makeTempContentRoot();

    expect(() =>
      rewriteOsPositioning({
        contentRoot: root,
        collection: "../outside",
        dryRun: false,
      }),
    ).toThrow("Collection must be a directory name inside the content root.");
    expect(() => parseArgs(["--collection=../guides"])).toThrow(
      "Collection must be a directory name inside the content root.",
    );
    expect(() => parseArgs(["--collection=."])).toThrow(
      "Collection must be a directory name inside the content root.",
    );
    expect(() => parseArgs(["--collection=guides/nested"])).toThrow(
      "Collection must be a directory name inside the content root.",
    );
  });

  it("rewrites nested markdown files and leaves non-markdown files alone", () => {
    const root = makeTempContentRoot();
    const nestedPath = writeMarkdown(
      root,
      join("guides", "nested"),
      "sample.md",
      [
        "---",
        'title: "Nested"',
        "---",
        "",
        "GrantPipe is a unified donor management and grant compliance platform built for mid-sized nonprofits.",
      ].join("\n"),
    );
    writeMarkdown(
      root,
      "guides",
      "notes.txt",
      "GrantPipe is donor management and grant compliance software.",
    );

    const result = rewriteOsPositioning({
      contentRoot: root,
      collection: "guides",
      dryRun: false,
    });

    expect(result.scanned).toBe(1);
    expect(result.written).toEqual([nestedPath]);
    expect(readFileSync(nestedPath, "utf8")).toContain(GRANTPIPE_OS_BOILERPLATE);
  });

  it("rewrites markdown without frontmatter", () => {
    const root = makeTempContentRoot();
    const path = writeMarkdown(
      root,
      "glossary",
      "sample.md",
      "GrantPipe is donor management and grant compliance software.",
    );

    const result = rewriteOsPositioning({
      contentRoot: root,
      collection: "glossary",
      dryRun: false,
    });

    expect(result.written).toEqual([path]);
    expect(readFileSync(path, "utf8")).toBe(GRANTPIPE_OS_BOILERPLATE);
  });

  it("parses required CLI arguments", () => {
    expect(parseArgs(["--collection=guides", "--dry-run"])).toEqual({
      collection: "guides",
      dryRun: true,
    });
    expect(parseArgs(["--collection=glossary"])).toEqual({
      collection: "glossary",
      dryRun: false,
    });
  });

  it("rejects CLI calls without a collection", () => {
    expect(() => parseArgs(["--dry-run"])).toThrow(
      "Missing required --collection=<name> argument.",
    );
  });

  it("formats CLI output without leaking file paths", () => {
    expect(
      formatCliResult({
        scanned: 2,
        changed: ["one.md", "two.md"],
        written: ["one.md"],
      }),
    ).toBe(JSON.stringify({ scanned: 2, changed: 2, written: 1 }, null, 2));
  });
});
