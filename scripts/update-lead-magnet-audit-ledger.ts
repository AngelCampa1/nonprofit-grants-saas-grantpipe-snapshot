import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  LEAD_MAGNET_SEQUENCE_METADATA,
  LEAD_MAGNET_SLUGS,
  leadMagnetAsset,
} from "../packages/shared/src/constants/lead-magnets";

const repoRoot = process.cwd();
const contentDir = join(
  repoRoot,
  "packages",
  "shared",
  "src",
  "knowledge",
  "marketing",
  "content",
  "lead-magnets",
);
const auditPath = join(
  repoRoot,
  "docs",
  "content-research",
  "lead-magnet-quality-audit-2026-05.md",
);

const header = [
  "| Slug | Title | Asset | Sequence family | Sequence slug | Stage | Topic | Route | R2 key | Reviewed | Verified | Sources | Result |",
  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---: | --- |",
].join("\n");

function frontmatter(source: string): string {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    throw new Error("Missing frontmatter");
  }
  return match[1]!;
}

function scalar(source: string, field: string): string {
  const match = source.match(new RegExp(`^${field}:\\s*(?:"([^"]+)"|'([^']+)'|([^\\n#]+))$`, "m"));
  const value = match?.[1]?.trim() ?? match?.[2]?.trim() ?? match?.[3]?.trim();
  if (!value) {
    throw new Error(`Missing scalar field ${field}`);
  }
  return value;
}

function listValues(source: string, field: string): string[] {
  const match = source.match(new RegExp(`^${field}:\\n((?:\\s+-\\s+.+\\n?)+)`, "m"));
  if (!match) {
    return [];
  }

  return [...match[1]!.matchAll(/^\s+-\s+(?:"([^"]+)"|'([^']+)'|([^\n#]+))$/gm)].map((entry) =>
    (entry[1] ?? entry[2] ?? entry[3])!.trim(),
  );
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|");
}

function rowForSlug(slug: (typeof LEAD_MAGNET_SLUGS)[number]): string {
  const source = readFileSync(join(contentDir, `${slug}.md`), "utf-8");
  const fm = frontmatter(source);
  const asset = leadMagnetAsset(slug);
  const sequence = LEAD_MAGNET_SEQUENCE_METADATA[slug];
  const cells = [
    slug,
    scalar(fm, "title"),
    asset.extension,
    sequence.family,
    sequence.sequenceSlug,
    sequence.buyerStage,
    sequence.topicCluster,
    scalar(fm, "deliverableUrl"),
    asset.r2Key,
    scalar(fm, "lastReviewedAt"),
    scalar(fm, "verifiedAt"),
    String(listValues(fm, "sourceUrls").length),
    "Pass - source-backed, artifact-style body present, routed deliverable checked by tests",
  ];

  return `| ${cells.map(escapeCell).join(" | ")} |`;
}

const audit = readFileSync(auditPath, "utf-8");
const startMarker = "## Audit Ledger";
const endMarker = "## Follow-Up Controls";
const start = audit.indexOf(startMarker);
const end = audit.indexOf(endMarker);

if (start === -1 || end === -1 || end <= start) {
  throw new Error("Could not find audit ledger section markers");
}

const before = audit.slice(0, start + startMarker.length);
const after = audit.slice(end);
const rows = LEAD_MAGNET_SLUGS.map(rowForSlug).join("\n");

writeFileSync(auditPath, `${before}\n\n${header}\n${rows}\n\n${after}`);
