/**
 * Generates 10 LinkedIn posts + 1 article for a given date by consuming
 * entries from the queue built by build-queue.ts.
 *
 * Usage:
 *   pnpm tsx scripts/linkedin/generate-day.ts
 *   pnpm tsx scripts/linkedin/generate-day.ts --date=2026-04-28
 *   pnpm tsx scripts/linkedin/generate-day.ts --bulk --days=100
 */

import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import type { PostQueueEntry, ArticleQueueEntry, Queue, PostType } from "./build-queue.js";
import { assertLinkedInPostsReviewed } from "../linkedin-post-review-gate.mjs";

// Load .env file manually if present (supports .env, .env.local, .env.linkedin)
function loadDotEnv(): void {
  const candidates = [".env.linkedin", ".env.local", ".env"];
  for (const name of candidates) {
    const envPath = path.resolve(name);
    if (!fs.existsSync(envPath)) continue;
    const lines = fs.readFileSync(envPath, "utf-8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx < 0) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed
        .slice(eqIdx + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
      if (key && !process.env[key]) {
        process.env[key] = val;
      }
    }
    break;
  }
}
loadDotEnv();

const QUEUE_FILE = path.resolve("scripts/linkedin/queue.json");
const SYSTEM_POST_FILE = path.resolve("scripts/linkedin/prompts/system-post.md");
const SYSTEM_ARTICLE_FILE = path.resolve("scripts/linkedin/prompts/system-article.md");
const OUTPUT_DIR = path.resolve("linkedin-output");
const MASTER_CSV = path.join(OUTPUT_DIR, "master.csv");

const POST_TYPES_ORDERED: PostType[] = [
  "stat_bomb",
  "myth_buster",
  "workflow_step",
  "term_explained",
  "tool_teardown",
  "vertical_hook",
  "free_resource",
  "comparison_insight",
  "question_post",
  "product_insight",
];

// Fallback order when a type is exhausted
const FALLBACK_TYPES: PostType[] = [
  "how_to",
  "list_post",
  "stat_bomb",
  "myth_buster",
  "tool_teardown",
  "vertical_hook",
  "free_resource",
  "comparison_insight",
  "question_post",
  "product_insight",
];

// CTA slots: product_insight is always slot 10 (index 9).
// Second CTA alternates between stat_bomb (even days) and comparison_insight (odd days).
function ctaSlots(dayIndex: number): Set<PostType> {
  const base: PostType = dayIndex % 2 === 0 ? "stat_bomb" : "comparison_insight";
  return new Set<PostType>(["product_insight", base]);
}

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0]!;
}

function parseArgs(): { date: string; bulk: boolean; days: number; dryRun: boolean } {
  const args = process.argv.slice(2);
  let date = formatDate(new Date());
  let bulk = false;
  let days = 1;
  let dryRun = false;

  for (const arg of args) {
    if (arg.startsWith("--date=")) {
      date = arg.split("=")[1]!;
    } else if (arg === "--bulk") {
      bulk = true;
    } else if (arg.startsWith("--days=")) {
      days = parseInt(arg.split("=")[1]!, 10);
    } else if (arg === "--dry-run") {
      dryRun = true;
    }
  }

  return { date, bulk, days, dryRun };
}

function loadQueue(): Queue {
  if (!fs.existsSync(QUEUE_FILE)) {
    throw new Error(`Queue file not found. Run: pnpm tsx scripts/linkedin/build-queue.ts`);
  }
  return JSON.parse(fs.readFileSync(QUEUE_FILE, "utf-8")) as Queue;
}

function saveQueue(queue: Queue): void {
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));
}

function pickNextPosts(queue: Queue, _dayIndex: number): PostQueueEntry[] {
  const picked: PostQueueEntry[] = [];
  const usedTypes = new Set<PostType>();

  // Pick one of each of the 10 primary types
  for (const targetType of POST_TYPES_ORDERED) {
    const entry = queue.posts.find((p) => !p.consumed && p.postType === targetType);
    if (entry) {
      picked.push(entry);
      usedTypes.add(targetType);
    }
  }

  // Fill remaining slots with fallback types if primary types are exhausted
  if (picked.length < 10) {
    for (const fallbackType of FALLBACK_TYPES) {
      if (picked.length >= 10) break;
      if (usedTypes.has(fallbackType)) continue;
      const entry = queue.posts.find((p) => !p.consumed && p.postType === fallbackType);
      if (entry) {
        picked.push(entry);
        usedTypes.add(fallbackType);
      }
    }
  }

  // Last resort: fill with any unconsumed entries
  if (picked.length < 10) {
    for (const entry of queue.posts) {
      if (picked.length >= 10) break;
      if (!entry.consumed && !picked.includes(entry)) {
        picked.push(entry);
      }
    }
  }

  return picked.slice(0, 10);
}

function pickNextArticle(queue: Queue): ArticleQueueEntry | null {
  return queue.articles.find((a) => !a.consumed) ?? null;
}

function buildPostBrief(entry: PostQueueEntry, slotIndex: number, isCta: boolean): string {
  const ctaNote = isCta
    ? "\nThis post should end with a soft mention of GrantPipe as the tool that solves this problem. Keep it 1 sentence, non-salesy."
    : "";

  const kd = entry.keyData;

  switch (entry.postType) {
    case "stat_bomb":
      return `Post ${slotIndex + 1} — STAT_BOMB
Title context: ${kd["title"]}
Key stat: ${kd["stat"]}
Stat source: ${kd["statSource"]}
Context: ${kd["bluf"]}
${ctaNote}
Write a stat bomb post. Lead with the raw number. Explain what it means for a mid-sized nonprofit managing grants. End with a question or implication.`;

    case "myth_buster": {
      const faq = kd["mythFaq"] as { q: string; a: string } | undefined;
      return `Post ${slotIndex + 1} — MYTH_BUSTER
Title context: ${kd["title"]}
Common belief (myth): ${faq?.q ?? ""}
Reality: ${faq?.a ?? ""}
Context: ${kd["bluf"]}
${ctaNote}
Write a myth-busting post. State the common belief plainly in the first line, then correct it with specifics. Name the regulation or source if available.`;
    }

    case "workflow_step": {
      const stepGroup = kd["stepGroup"] as Array<{ title: string; content: string }> | undefined;
      return `Post ${slotIndex + 1} — WORKFLOW_STEP
Workflow: ${kd["title"]}
Steps being covered: ${kd["stepNumbers"]} of ${kd["totalSteps"]}
${stepGroup?.map((s, _i) => `Step content: ${s.title} — ${s.content.slice(0, 300)}`).join("\n") ?? ""}
Context: ${kd["bluf"]}
${ctaNote}
Write a post breaking down this specific step(s) from a real nonprofit workflow. Lead with what most orgs get wrong at this step. Be specific.`;
    }

    case "term_explained":
      return `Post ${slotIndex + 1} — TERM_EXPLAINED
Term: ${kd["term"]}
Definition: ${kd["shortDef"]}
Full context: ${kd["longDef"]}
Examples: ${(kd["examples"] as string[]).join(" | ")}
${ctaNote}
Write a post explaining this term in plain language for a nonprofit finance practitioner. Lead with a scenario where this term matters. Avoid dictionary-style openers.`;

    case "tool_teardown":
      return `Post ${slotIndex + 1} — TOOL_TEARDOWN
Title: ${kd["title"]}
Key finding: ${kd["bluf"]}
Detail: ${kd["bodySnippet"]}
${ctaNote}
Write a frank, specific post about the real costs or limitations of this tool/vendor. No hyperbole, just the facts a decision-maker needs.`;

    case "vertical_hook":
      return `Post ${slotIndex + 1} — VERTICAL_HOOK
Vertical: ${kd["title"]}
Key context: ${kd["bluf"]}
Detail: ${kd["bodySnippet"]}
${ctaNote}
Write a post addressing a specific compliance or operational challenge for this type of nonprofit. Lead with a concrete scenario that people in this vertical will recognize.`;

    case "free_resource":
      return `Post ${slotIndex + 1} — FREE_RESOURCE
Resource: ${kd["title"]}
What it does: ${kd["bluf"]}
Detail: ${kd["bodySnippet"]}
Download URL hint: ${kd["deliverableUrl"]}
${ctaNote}
Write a post announcing this free resource. Lead with the problem it solves, not "new lead magnet" or another internal marketing label. Tell practitioners exactly what they get and why they'd need it.`;

    case "comparison_insight": {
      const a = kd["competitorA"] as { name: string; pricing: string } | undefined;
      const b = kd["competitorB"] as { name: string; pricing: string } | undefined;
      return `Post ${slotIndex + 1} — COMPARISON_INSIGHT
Comparison: ${kd["title"]}
Verdict: ${kd["verdict"]}
${a ? `${a.name}: ${a.pricing}` : ""}
${b ? `${b.name}: ${b.pricing}` : ""}
Context: ${kd["bluf"]}
${ctaNote}
Write a comparison post that gives a practitioner a clear decision framework. Not a sales pitch — a genuine "here's when you'd choose one vs. the other."`;
    }

    case "question_post":
      return `Post ${slotIndex + 1} — QUESTION_POST
Persona: ${kd["title"]}
Context: ${kd["bluf"]}
Detail: ${kd["bodySnippet"]}
${ctaNote}
Write an engagement question post aimed at this persona. Lead with a specific operational scenario they face, then ask a question about how they handle it. Make it feel like something a peer would ask.`;

    case "product_insight":
      return `Post ${slotIndex + 1} — PRODUCT_INSIGHT (include soft GrantPipe CTA)
Feature: ${kd["title"]}
Context: ${kd["bluf"]}
Detail: ${kd["bodySnippet"]}
This post MUST end with a soft mention of GrantPipe. One sentence, not salesy.
Write a post explaining why this specific capability matters for nonprofits managing grants and restricted funds. Lead with the problem, explain the solution, mention GrantPipe naturally at the end.`;

    case "list_post":
      return `Post ${slotIndex + 1} — LIST_POST
Title: ${kd["title"]}
Context: ${kd["bluf"]}
Detail: ${kd["bodySnippet"]}
${ctaNote}
Write a list-format post (prose lines, not bullet points) covering the key items. Lead with the hook, then walk through 3-5 specific items with enough detail to be useful.`;

    case "how_to":
      return `Post ${slotIndex + 1} — HOW_TO
Title: ${kd["title"]}
Key insight: ${kd["bluf"]}
Detail: ${kd["bodySnippet"]}
${ctaNote}
Write a how-to post covering the core process or approach. Lead with the most common failure point. Keep it actionable.`;

    default:
      return `Post ${slotIndex + 1}
Title: ${kd["title"]}
Context: ${kd["bluf"]}
${ctaNote}
Write a LinkedIn post based on this content.`;
  }
}

function buildPostPrompt(entries: PostQueueEntry[], dayIndex: number): string {
  const ctaSet = ctaSlots(dayIndex);
  const briefs = entries.map((entry, i) => {
    const isCta = ctaSet.has(entry.postType);
    return buildPostBrief(entry, i, isCta);
  });

  return `Generate all 10 LinkedIn posts below. Each post is independent — use only the brief provided for that post.

${briefs.join("\n\n---NEXT POST---\n\n")}`;
}

function buildArticlePrompt(entry: ArticleQueueEntry): string {
  return `Write a LinkedIn article based on the following source material.

Title (working title, you may improve it): ${entry.title}
Core argument: ${entry.bluf}
Source content:
${entry.bodySnippet}

Write the full article following your instructions. The article should be practitioner-grade — specific, actionable, and worth bookmarking.`;
}

interface ParsedPost {
  slot: number;
  type: string;
  text: string;
  hashtags: string;
}

function parsePosts(raw: string, entries: PostQueueEntry[]): ParsedPost[] {
  const posts: ParsedPost[] = [];
  // Split on the --- separators between posts
  const blocks = raw
    .split(/^---$/m)
    .map((b) => b.trim())
    .filter(Boolean);

  for (let i = 0; i < Math.min(blocks.length, 10); i++) {
    const block = blocks[i]!;
    // Extract hashtags from the last line
    const lines = block.split("\n");
    const lastLine = lines[lines.length - 1] ?? "";
    const hashtags = lastLine.startsWith("#") ? lastLine.trim() : "";
    const textLines = hashtags ? lines.slice(0, -1) : lines;
    const text = textLines.join("\n").trim();

    posts.push({
      slot: i + 1,
      type: entries[i]?.postType ?? "unknown",
      text,
      hashtags,
    });
  }

  return posts;
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function ensureCsvHeader(): void {
  if (!fs.existsSync(MASTER_CSV)) {
    ensureDir(OUTPUT_DIR);
    fs.writeFileSync(MASTER_CSV, "date,slot,type,post_text,hashtags,source_file,has_cta\n");
  }
}

function appendToCsv(
  date: string,
  posts: ParsedPost[],
  entries: PostQueueEntry[],
  dayIndex: number,
): void {
  const ctaSet = ctaSlots(dayIndex);
  const rows = posts.map((post, i) => {
    const entry = entries[i];
    const hasCta = entry ? ctaSet.has(entry.postType) : false;
    const sourceFile = entry?.sourceFile ?? "";
    // Escape CSV fields
    const escapeField = (s: string) => `"${s.replace(/"/g, '""').replace(/\n/g, " ↵ ")}"`;
    return [
      date,
      post.slot,
      post.type,
      escapeField(post.text),
      escapeField(post.hashtags),
      escapeField(sourceFile),
      hasCta ? "yes" : "no",
    ].join(",");
  });

  fs.appendFileSync(MASTER_CSV, rows.join("\n") + "\n");
}

function dryRunPosts(entries: PostQueueEntry[]): ParsedPost[] {
  return entries.map((e, i) => {
    const titleish =
      e.keyData["title"] ?? e.keyData["term"] ?? e.keyData["shortDef"] ?? "(no title)";
    return {
      slot: i + 1,
      type: e.postType,
      text: `[DRY RUN] ${e.postType.toUpperCase()} post from: ${e.sourceFile}\n\nTitle: ${titleish}`,
      hashtags: "#grantpipe #nonprofitfinance #grantcompliance",
    };
  });
}

function dryRunArticle(entry: ArticleQueueEntry): string {
  return `# [DRY RUN] ${entry.title}\n\nSource: ${entry.sourceFile}\n\nBluf: ${entry.bluf}\n\n---\n*This article is from Angel Campa.*\n`;
}

async function generateDay(
  date: string,
  dayIndex: number,
  queue: Queue,
  client: Anthropic | null,
  dryRun = false,
): Promise<void> {
  const systemPost = fs.readFileSync(SYSTEM_POST_FILE, "utf-8");
  const systemArticle = fs.readFileSync(SYSTEM_ARTICLE_FILE, "utf-8");

  const postEntries = pickNextPosts(queue, dayIndex);
  const articleEntry = pickNextArticle(queue);

  if (postEntries.length === 0) {
    console.log(`[${date}] No post entries remaining in queue.`);
    return;
  }

  const outDir = path.join(OUTPUT_DIR, date);
  ensureDir(outDir);

  let parsedPosts: ParsedPost[];
  let articleContent: string | null = null;

  if (dryRun) {
    console.log(`[${date}] DRY RUN — skipping API calls.`);
    parsedPosts = dryRunPosts(postEntries);
    if (articleEntry) {
      articleContent = dryRunArticle(articleEntry);
    }
  } else {
    if (!client) throw new Error("Anthropic client required for non-dry-run mode.");

    // Generate posts
    console.log(`[${date}] Generating ${postEntries.length} posts...`);
    const postPrompt = buildPostPrompt(postEntries, dayIndex);

    const postResponse = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      system: systemPost,
      messages: [{ role: "user", content: postPrompt }],
    });

    const postRaw = postResponse.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    parsedPosts = parsePosts(postRaw, postEntries);
    if (parsedPosts.length !== postEntries.length) {
      throw new Error(
        `Expected ${postEntries.length} LinkedIn posts from model output, parsed ${parsedPosts.length}. Refusing to consume queue entries.`,
      );
    }

    // Generate article
    if (articleEntry) {
      console.log(`[${date}] Generating article: ${articleEntry.title}...`);
      const articlePrompt = buildArticlePrompt(articleEntry);

      const articleResponse = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        system: systemArticle,
        messages: [{ role: "user", content: articlePrompt }],
      });

      articleContent = articleResponse.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");
    }
  }

  // Write posts.md
  if (!dryRun) {
    assertLinkedInPostsReviewed(
      parsedPosts.map((post) => ({
        id: `${date} slot ${post.slot}`,
        content: `${post.text}\n${post.hashtags}`.trim(),
        attachments: [],
      })),
    );
  }

  // Write posts.md
  const postsContent = parsedPosts
    .map((p) => `## Post ${p.slot} — ${p.type.toUpperCase()}\n\n${p.text}\n\n${p.hashtags}`)
    .join("\n\n---\n\n");
  fs.writeFileSync(
    path.join(outDir, "posts.md"),
    `# LinkedIn Posts — ${date}\n\n${postsContent}\n`,
  );

  // Write article.md
  if (articleContent) {
    fs.writeFileSync(path.join(outDir, "article.md"), articleContent + "\n");
    if (articleEntry) articleEntry.consumed = true;
  } else if (!articleEntry) {
    console.log(`[${date}] No article entries remaining.`);
  }

  // Mark posts consumed
  for (const entry of postEntries) {
    entry.consumed = true;
  }

  // Append to CSV
  ensureCsvHeader();
  appendToCsv(date, parsedPosts, postEntries, dayIndex);

  const remaining = queue.posts.filter((p) => !p.consumed).length;
  const remainingArticles = queue.articles.filter((a) => !a.consumed).length;
  console.log(
    `[${date}] Done. Queue remaining: ${remaining} posts, ${remainingArticles} articles.`,
  );
}

async function main() {
  const { date, bulk, days, dryRun } = parseArgs();
  const apiKey = process.env["ANTHROPIC_API_KEY"];

  if (!dryRun && !apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY environment variable is required.\n" +
        "Set it via: export ANTHROPIC_API_KEY=sk-ant-...\n" +
        "Or create a .env.linkedin file at the repo root with: ANTHROPIC_API_KEY=sk-ant-...\n" +
        "Get a key at https://console.anthropic.com/\n" +
        "To test the pipeline structure without an API key, use --dry-run.",
    );
  }

  const client = apiKey ? new Anthropic({ apiKey }) : null;
  const queue = loadQueue();

  if (bulk) {
    console.log(
      `Bulk mode: generating ${days} days starting from ${date}${dryRun ? " (DRY RUN)" : ""}`,
    );
    const startDate = new Date(date);
    for (let i = 0; i < days; i++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(startDate.getDate() + i);
      const dateStr = formatDate(currentDate);
      await generateDay(dateStr, i, queue, client, dryRun);
      saveQueue(queue);
    }
    console.log(`\nBulk generation complete. ${days} days generated.`);
  } else {
    const d = new Date(date);
    const dayIndex = Math.floor(
      (d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86400000,
    );
    await generateDay(date, dayIndex, queue, client, dryRun);
    saveQueue(queue);
  }

  const remaining = queue.posts.filter((p) => !p.consumed).length;
  const remainingArticles = queue.articles.filter((a) => !a.consumed).length;
  console.log(`\nFinal queue state: ${remaining} posts, ${remainingArticles} articles remaining.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
