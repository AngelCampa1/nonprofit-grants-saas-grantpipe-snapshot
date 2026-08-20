import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const sourceDirectory = fileURLToPath(new URL("./", import.meta.url));

const FILE_EXTENSIONS = new Set([
  ".css",
  ".ico",
  ".js",
  ".json",
  ".png",
  ".svg",
  ".txt",
  ".webmanifest",
  ".xml",
]);

function walk(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
      continue;
    }
    if (
      entry.isFile() &&
      /\.(astro|ts|tsx)$/.test(entry.name) &&
      !entry.name.endsWith(".test.ts") &&
      !entry.name.endsWith(".test.tsx")
    ) {
      files.push(fullPath);
    }
  }
  return files;
}

function isCanonicalPagePath(href: string): boolean {
  if (!href.startsWith("/") || href.startsWith("//")) return true;
  if (href === "/") return true;
  if (href.includes("#") || href.includes("?")) return true;
  if (FILE_EXTENSIONS.has(extname(href))) return true;
  return href.endsWith("/");
}

describe("canonical internal links", () => {
  it("uses trailing slashes for literal internal page hrefs in site source", () => {
    const failures: string[] = [];

    for (const filePath of walk(sourceDirectory)) {
      const source = readFileSync(filePath, "utf8");
      const hrefMatches = source.matchAll(/\bhref=["'](\/[^"']*)["']/g);

      for (const match of hrefMatches) {
        const href = match[1] ?? "";
        if (!isCanonicalPagePath(href)) {
          failures.push(`${relative(sourceDirectory, filePath)}: ${href}`);
        }
      }
    }

    expect(failures, `Slashless literal internal links:\n${failures.join("\n")}`).toEqual([]);
  });
});
