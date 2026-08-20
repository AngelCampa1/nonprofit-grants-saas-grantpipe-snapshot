import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_URL = import.meta.url;

export type StripMissingSourcemapResult = {
  scanned: number;
  updated: number;
};

const SOURCE_MAP_COMMENT_PATTERN = /^\s*\/\/# sourceMappingURL=([^\r\n]+)(?:\r?\n)?/gm;

function getMjsFiles(rootDir: string): string[] {
  const entries = readdirSync(rootDir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(rootDir, entry.name);

    if (entry.isSymbolicLink()) {
      continue;
    }

    if (entry.isDirectory()) {
      files.push(...getMjsFiles(fullPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".mjs")) {
      files.push(fullPath);
    }
  }

  return files;
}

function stripFile(filePath: string): boolean {
  const source = readFileSync(filePath, "utf8");
  const nextSource = source.replace(
    SOURCE_MAP_COMMENT_PATTERN,
    (comment: string, mapPath: string) => {
      const sourcemapPath = resolve(dirname(filePath), mapPath.trim());
      return existsSync(sourcemapPath) ? comment : "";
    },
  );

  if (nextSource === source) {
    return false;
  }

  writeFileSync(filePath, nextSource);
  return true;
}

export function stripMissingSourcemapComments(rootDir: string): StripMissingSourcemapResult {
  if (!existsSync(rootDir)) {
    throw new Error(`Server output directory not found: ${rootDir}`);
  }

  const files = getMjsFiles(rootDir);
  let updated = 0;

  for (const file of files) {
    if (stripFile(file)) {
      updated += 1;
    }
  }

  return { scanned: files.length, updated };
}

export function isEntrypoint(importMetaUrl: string, argvEntry?: string): boolean {
  if (!argvEntry) {
    return false;
  }

  return importMetaUrl === pathToFileURL(argvEntry).href;
}

export function runCli(argv: string[] = process.argv): void {
  if (!isEntrypoint(SCRIPT_URL, argv[1])) {
    return;
  }

  const rootDir = argv[2];

  if (!rootDir) {
    console.error("Usage: tsx scripts/strip-missing-sourcemap-comments.ts <server-output-dir>");
    process.exit(1);
  }

  try {
    const result = stripMissingSourcemapComments(rootDir);
    console.log(
      `Checked ${result.scanned} server chunks; stripped stale sourcemap comments from ${result.updated}.`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

runCli();
