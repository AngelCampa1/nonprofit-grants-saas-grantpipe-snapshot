import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";
import { marketingContentDirectory } from "./lib/marketing-content-root";

const contentDirectory = marketingContentDirectory;

function walkMarkdown(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkMarkdown(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(fullPath);
    }
  }
  return files;
}

const retiredFederalAuditThreshold = ["750", "000"].join(",");
const legacySingleAuditThresholdPattern = new RegExp(`\\$?${retiredFederalAuditThreshold}`, "gi");
const singleAuditContextPattern =
  /single audit|2 CFR 200(?:\.501| Subpart F)|federal (?:awards?|expenditures?|threshold)|Uniform Guidance/i;
const historicalThresholdContextPattern =
  /previous threshold|prior threshold|old threshold|then-current|historical|fiscal years 2022 and 2023|before (?:October 1, 2024|September 30, 2025)|on or after October 1, 2024|fiscal years ending before|earlier fiscal years|pre-Oct 2024|Type A threshold|state funding threshold|state funds|state requirement|state Single Audit|nonprofit audit threshold|gross national contributions|gross income|total revenue|review threshold|effective for fiscal years ending September 30, 2025 or later/i;

function getContextAround(source: string, index: number): string {
  const prefix = source.slice(0, index);
  const suffix = source.slice(index);
  const previousBoundary = Math.max(
    prefix.lastIndexOf("."),
    prefix.lastIndexOf("?"),
    prefix.lastIndexOf("!"),
    prefix.lastIndexOf("\n"),
  );
  const nextBoundaries = [".", "?", "!", "\n"]
    .map((boundary) => suffix.indexOf(boundary))
    .filter((boundaryIndex) => boundaryIndex >= 0);
  const nextBoundary = nextBoundaries.length > 0 ? Math.min(...nextBoundaries) : suffix.length;
  const contextStart = Math.max(0, previousBoundary + 1);
  const contextEnd = Math.min(source.length, index + nextBoundary + 1);

  return source.slice(contextStart, contextEnd).replace(/\s+/g, " ").trim();
}

function findStaleSingleAuditThresholdClaims(source: string): string[] {
  const claims: string[] = [];

  for (const match of source.matchAll(legacySingleAuditThresholdPattern)) {
    const context = getContextAround(source, match.index);
    if (
      singleAuditContextPattern.test(context) &&
      !historicalThresholdContextPattern.test(context)
    ) {
      claims.push(context);
    }
  }

  return claims;
}

function frontmatterScalar(source: string, field: string): string | null {
  const match = source.match(new RegExp(`^${field}:\\s*["']?(.+?)["']?\\s*$`, "m"));
  return match?.[1]?.trim() ?? null;
}

function hasTruncatedMetaText(text: string): boolean {
  const trimmed = text.trim();
  const withoutTerminalPunctuation = trimmed.replace(/[.!?]+$/, "").trim();

  return (
    /\b(?:a|across|an|and|for|into|managing|of|or|supporting|the|to|with|without)$/i.test(
      withoutTerminalPunctuation,
    ) ||
    /\b(?:different compliance|specific reporting|allowable)$/i.test(withoutTerminalPunctuation)
  );
}

function findMisleadingFormulaSeparators(source: string): string[] {
  return source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) =>
      [
        /\$\d[\d,]*(?:\s+[A-Za-z]+){0,4}\s+-\s+\d+\s*%/,
        /\$\d[\d,]*(?:\s+[A-Za-z]+){0,4}\s+-\s+\d+\s+-\s+\$\d/,
        /\d+\s+seats\s+-\s+\$\d/i,
        /\(\$\d[\d,]*\s+-\s+\d+\s+-\s+\$\d[\d,]*\s+-\s+\d+\)/,
      ].some((pattern) => pattern.test(line)),
    );
}

describe("technical SEO content freshness", () => {
  const corpusScanTimeoutMs = 60_000;

  it("keeps the SEO plan single audit threshold example internally consistent", () => {
    const seoPlan = readFileSync(
      join(process.cwd(), "../../docs/superpowers/plans/2026-05-13-seo-optimization.md"),
      "utf8",
    );

    expect(seoPlan).not.toContain("previous $1,000,000 threshold");
    expect(seoPlan).toContain("previous pre-2024 threshold");
  });

  it(
    "does not publish stale federal Single Audit threshold claims",
    () => {
      const failures: string[] = [];

      for (const file of walkMarkdown(contentDirectory)) {
        const source = readFileSync(file, "utf8");
        const staleClaims = findStaleSingleAuditThresholdClaims(source);
        for (const staleClaim of staleClaims) {
          failures.push(`${relative(contentDirectory, file)}: ${staleClaim}`);
        }
      }

      expect(
        failures,
        `Stale federal Single Audit threshold claims:\n${failures.join("\n")}`,
      ).toEqual([]);
    },
    corpusScanTimeoutMs,
  );

  it("does not publish SEO descriptions that end mid-thought", () => {
    const failures: string[] = [];

    for (const file of walkMarkdown(contentDirectory)) {
      const source = readFileSync(file, "utf8");
      const seoDescription = frontmatterScalar(source, "seoDescription");
      if (seoDescription && hasTruncatedMetaText(seoDescription)) {
        failures.push(`${relative(contentDirectory, file)}: ${seoDescription}`);
      }
    }

    expect(failures, `Truncated SEO descriptions:\n${failures.join("\n")}`).toEqual([]);
  });

  it("does not publish page descriptions that end mid-thought", () => {
    const failures: string[] = [];

    for (const file of walkMarkdown(contentDirectory)) {
      const source = readFileSync(file, "utf8");
      const description = frontmatterScalar(source, "description");
      if (description && hasTruncatedMetaText(description)) {
        failures.push(`${relative(contentDirectory, file)}: ${description}`);
      }
    }

    expect(failures, `Truncated page descriptions:\n${failures.join("\n")}`).toEqual([]);
  });

  it("does not publish metadata that ends with trailing filler fragments", () => {
    const failures: string[] = [];

    for (const file of walkMarkdown(contentDirectory)) {
      const source = readFileSync(file, "utf8");
      for (const field of ["description", "seoDescription"]) {
        const value = frontmatterScalar(source, field);
        const normalizedValue = value?.replace(/[.!?]+$/, "").trim();
        if (
          normalizedValue &&
          (/\b(?:between|here is|included|that)$/i.test(normalizedValue) ||
            /\b(?:convert to a funded|metrics that prove|pay to run|where grant compliance)$/i.test(
              normalizedValue,
            ))
        ) {
          failures.push(`${relative(contentDirectory, file)} ${field}: ${value}`);
        }
      }
    }

    expect(
      failures,
      `Metadata ends with trailing filler fragments:\n${failures.join("\n")}`,
    ).toEqual([]);
  });

  it("does not publish em dashes in marketing markdown", () => {
    const failures: string[] = [];

    for (const file of walkMarkdown(contentDirectory)) {
      const source = readFileSync(file, "utf8");
      const lines = source.split("\n");
      lines.forEach((line, index) => {
        if (line.includes("\u2014")) {
          failures.push(`${relative(contentDirectory, file)}:${index + 1}`);
        }
      });
    }

    expect(failures, `Marketing markdown contains em dashes:\n${failures.join("\n")}`).toEqual([]);
  });

  it("does not convert formula separators into subtraction operators", () => {
    const failures: string[] = [];

    for (const file of walkMarkdown(contentDirectory)) {
      const source = readFileSync(file, "utf8");
      for (const line of findMisleadingFormulaSeparators(source)) {
        failures.push(`${relative(contentDirectory, file)}: ${line}`);
      }
    }

    expect(
      failures,
      `Formula text uses misleading subtraction separators:\n${failures.join("\n")}`,
    ).toEqual([]);
  });

  it("does not expose repository design instructions in public AI instructions", () => {
    const publicAgents = readFileSync(join(process.cwd(), "public/AGENTS.md"), "utf8");

    expect(publicAgents).not.toContain("## Design Canon");
    expect(publicAgents).not.toContain("Buttons are pills");
  });
});
