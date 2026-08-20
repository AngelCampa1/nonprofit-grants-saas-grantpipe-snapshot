import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { assertLinkedInPostsReviewed } from "../linkedin-post-review-gate.mjs";

type ManifestStatus = "pending" | "scheduled" | "manual_follow_up";

interface ManifestItem {
  id: string;
  date: string;
  time: string;
  kind: "post" | "article";
  text: string;
  status: ManifestStatus;
  sourceFile?: string;
  metadata?: Record<string, unknown>;
}

const MANIFEST_PATH = path.resolve("linkedin-output/schedule-manifest.json");
const EXPECTED_TOTAL = 363;
const EXPECTED_POSTS = 330;
const EXPECTED_ARTICLES = 33;

function readManifest(): ManifestItem[] {
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8")) as ManifestItem[];
}

function hasBannedCommentsCta(text: string): boolean {
  return /link\s+(is\s+)?in\s+the\s+comments/i.test(text);
}

function hasLeadingParagraphSpace(text: string): boolean {
  return /(^|\n) +\S/.test(text);
}

function hasSingleNewlineParagraphJoin(text: string): boolean {
  return /[^\n]\n[^\n]/.test(text);
}

function assertNoFailures(label: string, failures: string[]): void {
  if (failures.length === 0) {
    return;
  }

  throw new Error(`${label}:\n${failures.join("\n")}`);
}

function claimSourcesForManifestItem(item: ManifestItem): unknown {
  return (
    item.metadata?.claim_sources ??
    item.metadata?.claimSources ??
    (item.sourceFile ? [item.sourceFile] : undefined)
  );
}

export function auditScheduleManifestItems(manifest: ManifestItem[]): string {
  assertLinkedInPostsReviewed(
    manifest
      .filter((item) => item.kind === "post")
      .map((item) => ({
        id: item.id,
        content: item.text,
        metadata: {
          ...item.metadata,
          claim_sources: claimSourcesForManifestItem(item),
        },
        requireClaimSources: true,
      })),
  );

  const posts = manifest.filter((item) => item.kind === "post");
  const articles = manifest.filter((item) => item.kind === "article");

  const countFailures: string[] = [];
  if (manifest.length !== EXPECTED_TOTAL) {
    countFailures.push(`Expected ${EXPECTED_TOTAL} total, found ${manifest.length}`);
  }
  if (posts.length !== EXPECTED_POSTS) {
    countFailures.push(`Expected ${EXPECTED_POSTS} posts, found ${posts.length}`);
  }
  if (articles.length !== EXPECTED_ARTICLES) {
    countFailures.push(`Expected ${EXPECTED_ARTICLES} articles, found ${articles.length}`);
  }

  assertNoFailures("Manifest count audit failed", countFailures);

  const bannedCtaFailures = manifest
    .filter((item) => hasBannedCommentsCta(item.text))
    .map((item) => item.id);
  const leadingSpaceFailures = manifest
    .filter((item) => hasLeadingParagraphSpace(item.text))
    .map((item) => item.id);
  const paragraphJoinFailures = posts
    .filter((item) => hasSingleNewlineParagraphJoin(item.text))
    .map((item) => item.id);

  assertNoFailures(
    "Banned comments CTA found",
    bannedCtaFailures.map((id) => `- ${id}`),
  );
  assertNoFailures(
    "Leading paragraph spaces found",
    leadingSpaceFailures.map((id) => `- ${id}`),
  );
  assertNoFailures(
    "Single-newline paragraph joins found in posts",
    paragraphJoinFailures.map((id) => `- ${id}`),
  );

  const statuses = manifest.reduce<Record<ManifestStatus, number>>(
    (counts, item) => {
      counts[item.status] += 1;
      return counts;
    },
    {
      pending: 0,
      scheduled: 0,
      manual_follow_up: 0,
    },
  );

  return [
    "Manifest audit passed.",
    `${manifest.length} total`,
    `${posts.length} posts`,
    `${articles.length} articles`,
    `${statuses.scheduled} scheduled`,
    `${statuses.pending} pending`,
    `${statuses.manual_follow_up} manual_follow_up`,
  ].join(" | ");
}

function main(): void {
  console.log(auditScheduleManifestItems(readManifest()));
}

function isEntrypoint(metaUrl: string, argvPath = process.argv[1]): boolean {
  return argvPath ? metaUrl === pathToFileURL(argvPath).href : false;
}

if (isEntrypoint(import.meta.url)) {
  main();
}
