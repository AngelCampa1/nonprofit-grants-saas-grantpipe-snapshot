import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import matter from "gray-matter";

import { GRANTPIPE_OS_BOILERPLATE } from "@grantpipe/shared";
import { getMarketingContentCollectionBase } from "@grantpipe/shared/public-kb";

export type RewriteOsPositioningOptions = {
  contentRoot?: string;
  collection: string;
  dryRun: boolean;
};

export type RewriteOsPositioningResult = {
  scanned: number;
  changed: string[];
  written: string[];
};

const defaultContentRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  getMarketingContentCollectionBase("guides"),
  "..",
);

const legacyBodyPatterns = [
  /\bGrantPipe is donor management and grant compliance software for mid-sized nonprofits\./g,
  /\bGrantPipe is donor management and grant compliance software\./g,
  /\bGrantPipe is a unified donor management and grant compliance platform built for mid-sized nonprofits\./g,
];

function validateCollection(collection: string): void {
  if (
    isAbsolute(collection) ||
    collection === "." ||
    collection.includes("/") ||
    collection.includes("\\") ||
    collection.split(/[\\/]+/).includes("..")
  ) {
    throw new Error("Collection must be a directory name inside the content root.");
  }
}

function collectionPath(contentRoot: string, collection: string): string {
  validateCollection(collection);
  const root = resolve(contentRoot);
  const target = resolve(root, collection);
  const rootPrefix = root.endsWith(sep) ? root : `${root}${sep}`;

  if (target !== root && !target.startsWith(rootPrefix)) {
    throw new Error("Collection must be a directory name inside the content root.");
  }

  return target;
}

function getMarkdownFiles(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }

  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return getMarkdownFiles(path);
    }
    return entry.isFile() && entry.name.endsWith(".md") ? [path] : [];
  });
}

function rewriteBody(body: string): string {
  return legacyBodyPatterns.reduce(
    (updated, pattern) => updated.replace(pattern, GRANTPIPE_OS_BOILERPLATE),
    body,
  );
}

function replaceBodyPreservingFrontmatter(source: string, nextBody: string): string {
  const match = source.match(/^(\uFEFF?---\r?\n[\s\S]*?\r?\n---)(\r?\n?)[\s\S]*$/);
  if (!match) {
    return nextBody;
  }

  const separator = match[2] && match[2].length > 0 ? match[2] : "\n";
  return `${match[1]}${separator}${nextBody.trimStart()}`;
}

export function rewriteOsPositioning(
  options: RewriteOsPositioningOptions,
): RewriteOsPositioningResult {
  const collectionDir = collectionPath(
    options.contentRoot ?? defaultContentRoot,
    options.collection,
  );
  const files = getMarkdownFiles(collectionDir);
  const changed: string[] = [];
  const written: string[] = [];

  for (const filePath of files) {
    const source = readFileSync(filePath, "utf8");
    const parsed = matter(source);
    const nextBody = rewriteBody(parsed.content);

    if (nextBody === parsed.content) {
      continue;
    }

    changed.push(filePath);

    if (!options.dryRun) {
      const nextSource = replaceBodyPreservingFrontmatter(source, nextBody);
      writeFileSync(filePath, nextSource, "utf8");
      written.push(filePath);
    }
  }

  return {
    scanned: files.length,
    changed,
    written,
  };
}

export function parseArgs(argv: readonly string[]): RewriteOsPositioningOptions {
  const dryRun = argv.includes("--dry-run");
  const collectionArg = argv.find((arg) => arg.startsWith("--collection="));
  const collection = collectionArg?.slice("--collection=".length);

  if (!collection) {
    throw new Error("Missing required --collection=<name> argument.");
  }

  validateCollection(collection);

  return { collection, dryRun };
}

export function formatCliResult(result: RewriteOsPositioningResult): string {
  return JSON.stringify(
    {
      scanned: result.scanned,
      changed: result.changed.length,
      written: result.written.length,
    },
    null,
    2,
  );
}

/* v8 ignore next 4 */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = rewriteOsPositioning(parseArgs(process.argv.slice(2)));
  console.log(formatCliResult(result));
}
