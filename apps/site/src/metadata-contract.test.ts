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

function extractFrontmatter(source: string): string {
  return source.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "";
}

function extractScalarField(source: string, field: string): string | null {
  const frontmatter = extractFrontmatter(source);
  const match = frontmatter.match(new RegExp(`^${field}:\\s*(?:"([^"]+)"|([^\\n#]+))\\s*$`, "m"));
  return (match?.[1] ?? match?.[2])?.trim() ?? null;
}

const terminalStopwords = new Set([
  "and",
  "at",
  "by",
  "for",
  "from",
  "how",
  "in",
  "on",
  "or",
  "to",
  "under",
  "what",
  "with",
  "your",
]);

const danglingTerminalAdjectives = new Set(["audit-ready"]);

function terminalWord(value: string): string {
  return (
    value
      .replace(/[.!?:;,)]+$/g, "")
      .trim()
      .split(/\s+/)
      .pop()
      ?.toLowerCase() ?? ""
  );
}

describe("content metadata contract", () => {
  const contentFiles = walkMarkdown(contentDirectory);

  it("keeps seo titles unique and within the SERP-safe display length", () => {
    const failures: string[] = [];
    const seen = new Map<string, string[]>();

    for (const filePath of contentFiles) {
      const source = readFileSync(filePath, "utf8");
      const seoTitle = extractScalarField(source, "seoTitle");
      const relPath = relative(contentDirectory, filePath);

      if (!seoTitle) {
        failures.push(`${relPath}: missing seoTitle`);
        continue;
      }
      if (seoTitle.length > 60) {
        failures.push(`${relPath}: seoTitle is ${seoTitle.length} chars`);
      }
      if (seoTitle.includes("...") || seoTitle.includes("…")) {
        failures.push(`${relPath}: seoTitle contains truncation ellipsis`);
      }
      if (terminalStopwords.has(terminalWord(seoTitle))) {
        failures.push(`${relPath}: seoTitle ends with stopword "${terminalWord(seoTitle)}"`);
      }

      const matches = seen.get(seoTitle) ?? [];
      matches.push(relPath);
      seen.set(seoTitle, matches);
    }

    for (const [title, files] of seen) {
      if (files.length > 1) {
        failures.push(`duplicate seoTitle "${title}": ${files.join(", ")}`);
      }
    }

    expect(failures, `SEO title failures:\n${failures.join("\n")}`).toEqual([]);
  });

  it("keeps seo descriptions unique and within the SERP-safe summary length", () => {
    const failures: string[] = [];
    const seen = new Map<string, string[]>();

    for (const filePath of contentFiles) {
      const source = readFileSync(filePath, "utf8");
      const seoDescription = extractScalarField(source, "seoDescription");
      const relPath = relative(contentDirectory, filePath);

      if (!seoDescription) {
        failures.push(`${relPath}: missing seoDescription`);
        continue;
      }
      if (seoDescription.length < 120 || seoDescription.length > 160) {
        failures.push(`${relPath}: seoDescription is ${seoDescription.length} chars`);
      }
      if (seoDescription.includes("...") || seoDescription.includes("…")) {
        failures.push(`${relPath}: seoDescription contains truncation ellipsis`);
      }
      if (terminalStopwords.has(terminalWord(seoDescription))) {
        failures.push(
          `${relPath}: seoDescription ends with stopword "${terminalWord(seoDescription)}"`,
        );
      }
      if (danglingTerminalAdjectives.has(terminalWord(seoDescription))) {
        failures.push(
          `${relPath}: seoDescription ends with dangling adjective "${terminalWord(
            seoDescription,
          )}"`,
        );
      }

      const matches = seen.get(seoDescription) ?? [];
      matches.push(relPath);
      seen.set(seoDescription, matches);
    }

    for (const [description, files] of seen) {
      if (files.length > 1) {
        failures.push(`duplicate seoDescription "${description}": ${files.join(", ")}`);
      }
    }

    expect(failures, `SEO description failures:\n${failures.join("\n")}`).toEqual([]);
  });
});
