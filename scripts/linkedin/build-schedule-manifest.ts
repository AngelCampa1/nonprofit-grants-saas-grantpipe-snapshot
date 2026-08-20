import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const OUTPUT_DIR = path.resolve("linkedin-output");
const MANIFEST_JSON = path.join(OUTPUT_DIR, "schedule-manifest.json");
const MANIFEST_CSV = path.join(OUTPUT_DIR, "schedule-manifest.csv");
const START_DATE = "2026-04-29";
const END_DATE = "2026-05-31";

const SLOT_TIMES: Record<number, string> = {
  1: "05:13",
  2: "06:37",
  3: "08:01",
  4: "09:25",
  5: "10:49",
  6: "12:13",
  7: "13:37",
  8: "15:01",
  9: "17:49",
  10: "19:13",
};

interface MarkdownPost {
  slot: number;
  type: string;
  text: string;
}

interface ManifestItem {
  id: string;
  date: string;
  time: string;
  kind: "post" | "article";
  slot: number | null;
  type: string;
  sourceFile: string;
  text: string;
  status: "pending" | "scheduled" | "manual_follow_up";
  scheduledAt?: string;
  notes?: string;
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function articleTitle(markdown: string): string {
  const firstHeading = markdown.split(/\r?\n/).find((line) => line.startsWith("# "));
  return firstHeading?.replace(/^#\s+/, "").trim() ?? "LinkedIn Article";
}

function parseDailyPostsMarkdown(markdown: string): MarkdownPost[] {
  const posts: MarkdownPost[] = [];
  const postPattern =
    /\*\*Post (\d+) [—-] ([^*]+)\*\*\s*\n\n([\s\S]*?)(?=\n---\n|\n\*\*Post \d+ [—-] |$)/g;
  let match: RegExpExecArray | null;

  while ((match = postPattern.exec(markdown)) !== null) {
    posts.push({
      slot: Number(match[1]),
      type: match[2].trim(),
      text: normalizeLinkedInText(match[3]),
    });
  }

  return posts;
}

export function normalizeLinkedInText(text: string): string {
  return text
    .replace(/\s*↵+\s*/g, "\n\n")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/([^\n])\n([^\n])/g, "$1\n\n$2")
    .trim();
}

function readExistingManifest(): Map<string, ManifestItem> {
  if (!fs.existsSync(MANIFEST_JSON)) {
    return new Map();
  }

  const existing = JSON.parse(fs.readFileSync(MANIFEST_JSON, "utf8")) as ManifestItem[];

  return new Map(existing.map((item) => [item.id, item]));
}

function hasSingleNewlineParagraphJoin(text: string): boolean {
  return /[^\n]\n[^\n]/.test(text);
}

function stripSchedulingRepairNotes(notes: string | undefined): string | undefined {
  if (!notes) {
    return undefined;
  }

  const cleaned = notes
    .replace(
      / Scheduled before paragraph spacing fix; inspect\/edit scheduled LinkedIn item in place\./g,
      "",
    )
    .replace(
      /^Scheduled before paragraph spacing fix; inspect\/edit scheduled LinkedIn item in place\. ?/g,
      "",
    )
    .replace(
      / Scheduled before manifest text repair; inspect\/edit scheduled LinkedIn item in place\./g,
      "",
    )
    .replace(
      /^Scheduled before manifest text repair; inspect\/edit scheduled LinkedIn item in place\. ?/g,
      "",
    )
    .trim();

  return cleaned.length > 0 ? cleaned : undefined;
}

function appendNote(notes: string | undefined, note: string): string {
  const cleaned = stripSchedulingRepairNotes(notes);
  return cleaned ? `${cleaned} ${note}` : note;
}

function isInRange(date: string): boolean {
  return date >= START_DATE && date <= END_DATE;
}

function main(): void {
  const existingManifest = readExistingManifest();
  const manifest: ManifestItem[] = [];

  for (const dayDir of fs.readdirSync(OUTPUT_DIR).sort()) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dayDir) || !isInRange(dayDir)) {
      continue;
    }

    const postsPath = path.join(OUTPUT_DIR, dayDir, "posts.md");
    const posts = parseDailyPostsMarkdown(fs.readFileSync(postsPath, "utf8"));

    for (const post of posts) {
      const time = SLOT_TIMES[post.slot];
      if (!time) {
        throw new Error(`Unexpected slot ${post.slot} for ${dayDir}`);
      }

      manifest.push({
        id: `${dayDir}-post-${String(post.slot).padStart(2, "0")}`,
        date: dayDir,
        time,
        kind: "post",
        slot: post.slot,
        type: post.type,
        sourceFile: path.relative(process.cwd(), postsPath),
        text: post.text,
        status: "pending",
      });
    }
  }

  for (const dayDir of fs.readdirSync(OUTPUT_DIR).sort()) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dayDir) || !isInRange(dayDir)) {
      continue;
    }

    const articlePath = path.join(OUTPUT_DIR, dayDir, "article.md");
    const text = normalizeLinkedInText(fs.readFileSync(articlePath, "utf8"));

    manifest.push({
      id: `${dayDir}-article`,
      date: dayDir,
      time: "16:25",
      kind: "article",
      slot: null,
      type: "ARTICLE",
      sourceFile: path.relative(process.cwd(), articlePath),
      text,
      status: "pending",
    });
  }

  manifest.sort((a, b) => {
    const dateCompare = a.date.localeCompare(b.date);
    if (dateCompare !== 0) {
      return dateCompare;
    }
    return a.time.localeCompare(b.time);
  });

  for (const item of manifest) {
    const existing = existingManifest.get(item.id);
    if (!existing) {
      continue;
    }

    const wasSpacingRisk =
      existing.kind === "post" &&
      existing.status === "scheduled" &&
      hasSingleNewlineParagraphJoin(existing.text);
    const textChanged =
      existing.kind === "post" &&
      existing.status === "scheduled" &&
      normalizeLinkedInText(existing.text) !== item.text;

    item.status = existing.status;
    item.scheduledAt = existing.scheduledAt;
    item.notes = stripSchedulingRepairNotes(existing.notes);

    if (wasSpacingRisk) {
      const spacingNote =
        "Scheduled before paragraph spacing fix; inspect/edit scheduled LinkedIn item in place.";
      item.notes = appendNote(item.notes, spacingNote);
    }

    if (textChanged) {
      const textRepairNote =
        "Scheduled before manifest text repair; inspect/edit scheduled LinkedIn item in place.";
      item.notes = appendNote(item.notes, textRepairNote);
    }
  }

  const expectedDays = 33;
  const expectedPosts = expectedDays * 10;
  const expectedArticles = expectedDays;

  const postCount = manifest.filter((item) => item.kind === "post").length;
  const articleCount = manifest.filter((item) => item.kind === "article").length;

  if (postCount !== expectedPosts || articleCount !== expectedArticles) {
    throw new Error(`Manifest count mismatch: ${postCount} posts, ${articleCount} articles`);
  }

  const duplicateIds = manifest
    .map((item) => item.id)
    .filter((id, index, all) => all.indexOf(id) !== index);

  if (duplicateIds.length > 0) {
    throw new Error(`Duplicate manifest ids: ${duplicateIds.join(", ")}`);
  }

  fs.writeFileSync(MANIFEST_JSON, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(
    MANIFEST_CSV,
    [
      "id,date,time,kind,slot,type,sourceFile,titleOrHook,status",
      ...manifest.map((item) =>
        [
          item.id,
          item.date,
          item.time,
          item.kind,
          item.slot === null ? "" : String(item.slot),
          item.type,
          item.sourceFile,
          item.kind === "article" ? articleTitle(item.text) : (item.text.split(/\r?\n/)[0] ?? ""),
          item.status,
        ]
          .map(csvEscape)
          .join(","),
      ),
    ].join("\n") + "\n",
  );

  console.log(`Wrote ${manifest.length} items: ${postCount} posts, ${articleCount} articles`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
