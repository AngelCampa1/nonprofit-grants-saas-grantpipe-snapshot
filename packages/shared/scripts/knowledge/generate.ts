import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MARKETING_CONTENT_COLLECTIONS,
  type MarketingContentCollection,
} from "../../src/knowledge/types";

const GENERATED_AT = "2026-05-09";
const scriptDirectory = fileURLToPath(new URL(".", import.meta.url));
const sharedRoot = resolve(scriptDirectory, "../..");
const knowledgeRoot = join(sharedRoot, "src", "knowledge");
const contentRoot = join(knowledgeRoot, "marketing", "content");
const generatedRoot = join(knowledgeRoot, "generated");
const checkMode = process.argv.includes("--check");

type GeneratedFile = {
  path: string;
  content: string;
};

type MarketingKnowledgeEntryInput = {
  id: string;
  title: string;
  collection: MarketingContentCollection;
  slug: string;
  path: string;
  consumers: readonly ["public-marketing", "ai-sdr"];
  visibility: "public";
  safety: "public-safe";
};

function listMarkdownFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];

  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) return listMarkdownFiles(fullPath);
    return entry.name.endsWith(".md") ? [fullPath] : [];
  });
}

function parseFrontmatterTitle(source: string, fallback: string): string {
  const frontmatter = source.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "";
  const title = frontmatter.match(/^title:\s*"?([^"\r\n]+)"?\s*$/m)?.[1]?.trim();
  return title && title.length > 0 ? title : fallback;
}

function slugFromPath(filePath: string): string {
  return filePath.replace(/\\/g, "/").split("/").at(-1)!.replace(/\.md$/, "");
}

function buildMarketingEntries(): MarketingKnowledgeEntryInput[] {
  return MARKETING_CONTENT_COLLECTIONS.flatMap((collection) =>
    listMarkdownFiles(join(contentRoot, collection)).map((filePath) => {
      const slug = slugFromPath(filePath);
      const path = relative(contentRoot, filePath).replace(/\\/g, "/");
      return {
        id: `${collection}:${slug}`,
        title: parseFrontmatterTitle(readFileSync(filePath, "utf8"), slug),
        collection,
        slug,
        path,
        consumers: ["public-marketing", "ai-sdr"],
        visibility: "public",
        safety: "public-safe",
      };
    }),
  ).sort((left, right) => left.id.localeCompare(right.id));
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function buildIndexesTs(entries: MarketingKnowledgeEntryInput[]): string {
  return `import type { MarketingKnowledgeIndex } from "../types";

export const MARKETING_KNOWLEDGE_INDEX: MarketingKnowledgeIndex = {
  generatedAt: ${JSON.stringify(GENERATED_AT)},
  entries: ${JSON.stringify(entries, null, 2)},
};

export const PUBLIC_KNOWLEDGE_INDEX: MarketingKnowledgeIndex = MARKETING_KNOWLEDGE_INDEX;
`;
}

function buildFiles(): GeneratedFile[] {
  const entries = buildMarketingEntries();
  const marketingIndex = { generatedAt: GENERATED_AT, entries };

  return [
    { path: join(generatedRoot, "indexes.ts"), content: buildIndexesTs(entries) },
    { path: join(generatedRoot, "marketing-knowledge.json"), content: stableJson(marketingIndex) },
  ];
}

function assertGeneratedFilesCurrent(files: GeneratedFile[]): void {
  const staleFiles = files.filter(
    (file) => !existsSync(file.path) || readFileSync(file.path, "utf8") !== file.content,
  );

  if (staleFiles.length > 0) {
    throw new Error(
      `Knowledge artifacts are stale. Run pnpm knowledge:generate. Stale files: ${staleFiles
        .map((file) => relative(sharedRoot, file.path).replace(/\\/g, "/"))
        .join(", ")}`,
    );
  }
}

function writeGeneratedFiles(files: GeneratedFile[]): void {
  mkdirSync(generatedRoot, { recursive: true });
  for (const file of files) writeFileSync(file.path, file.content);
}

const files = buildFiles();

if (checkMode) {
  assertGeneratedFilesCurrent(files);
} else {
  writeGeneratedFiles(files);
}
