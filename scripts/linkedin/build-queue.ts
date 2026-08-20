/**
 * Scans all marketing knowledge content files and builds a structured
 * queue of LinkedIn post angles and article candidates.
 *
 * Run once: pnpm tsx scripts/linkedin/build-queue.ts
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { getMarketingContentCollectionBase } from "../../packages/shared/src/public-kb/index";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(scriptDirectory, "../..");
const CONTENT_DIR = path.resolve(
  REPO_ROOT,
  "apps/site",
  getMarketingContentCollectionBase("guides"),
  "..",
);
const OUTPUT_FILE = path.resolve("scripts/linkedin/queue.json");

export type PostType =
  | "stat_bomb"
  | "myth_buster"
  | "workflow_step"
  | "term_explained"
  | "tool_teardown"
  | "vertical_hook"
  | "free_resource"
  | "comparison_insight"
  | "question_post"
  | "product_insight"
  | "list_post"
  | "how_to";

export interface PostQueueEntry {
  id: string;
  sourceFile: string;
  postType: PostType;
  keyData: Record<string, unknown>;
  consumed: boolean;
}

export interface ArticleQueueEntry {
  id: string;
  sourceFile: string;
  title: string;
  bluf: string;
  bodySnippet: string;
  consumed: boolean;
}

export interface Queue {
  posts: PostQueueEntry[];
  articles: ArticleQueueEntry[];
  builtAt: string;
}

function slug(filePath: string): string {
  return path.basename(filePath, ".md");
}

function category(filePath: string): string {
  const rel = path.relative(CONTENT_DIR, filePath);
  return rel.split(path.sep)[0] ?? "unknown";
}

function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]+`/g, "")
    .replace(/#{1,6}\s+/g, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^[|-].*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function makeId(type: string, cat: string, fileSlug: string, suffix = ""): string {
  const base = `${type}__${cat}__${fileSlug}`;
  return suffix ? `${base}__${suffix}` : base;
}

function walkDir(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDir(full));
    } else if (entry.name.endsWith(".md")) {
      results.push(full);
    }
  }
  return results;
}

function buildPostEntries(
  filePath: string,
  fm: Record<string, unknown>,
  body: string,
): PostQueueEntry[] {
  const cat = category(filePath);
  const fileSlug = slug(filePath);
  const title = String(fm["title"] ?? "");
  const bluf = String(fm["bluf"] ?? "");
  const entries: PostQueueEntry[] = [];

  // stat_bomb — guides with pricingStats
  if (cat === "guides") {
    const stats = fm["pricingStats"] as Array<{ stat: string; source: string }> | undefined;
    if (stats && stats.length > 0) {
      for (let i = 0; i < Math.min(stats.length, 2); i++) {
        const s = stats[i];
        if (!s) continue;
        entries.push({
          id: makeId("stat_bomb", cat, fileSlug, String(i)),
          sourceFile: path.relative(process.cwd(), filePath),
          postType: "stat_bomb",
          keyData: { title, bluf, stat: s.stat, statSource: s.source },
          consumed: false,
        });
      }
    }

    // how_to — guides without stats (or with stats, but also eligible as how_to)
    if (bluf) {
      const faqs = fm["faqs"] as Array<{ q: string; a: string }> | undefined;
      entries.push({
        id: makeId("how_to", cat, fileSlug),
        sourceFile: path.relative(process.cwd(), filePath),
        postType: "how_to",
        keyData: {
          title,
          bluf,
          faqs: faqs?.slice(0, 2) ?? [],
          bodySnippet: stripMarkdown(body).slice(0, 800),
        },
        consumed: false,
      });
    }
  }

  // myth_buster — any file with faqs
  const faqs = fm["faqs"] as Array<{ q: string; a: string }> | undefined;
  if (faqs && faqs.length > 0) {
    const mythFaqs = faqs.filter((f) => {
      const lower = f.a.toLowerCase();
      return (
        lower.startsWith("no") ||
        lower.includes("common misconception") ||
        lower.includes("incorrect") ||
        lower.includes("not allowed") ||
        lower.includes("cannot") ||
        lower.includes("must not")
      );
    });
    if (mythFaqs.length > 0) {
      entries.push({
        id: makeId("myth_buster", cat, fileSlug),
        sourceFile: path.relative(process.cwd(), filePath),
        postType: "myth_buster",
        keyData: { title, bluf, mythFaq: mythFaqs[0] },
        consumed: false,
      });
    }
  }

  // workflow_step — workflows with steps
  if (cat === "workflows") {
    const steps = fm["steps"] as Array<{ title: string; content: string }> | undefined;
    if (steps && steps.length > 0) {
      // Generate one post per 2-3 steps (grouped)
      for (let i = 0; i < steps.length; i += 2) {
        const group = steps.slice(i, i + 2);
        entries.push({
          id: makeId("workflow_step", cat, fileSlug, String(i)),
          sourceFile: path.relative(process.cwd(), filePath),
          postType: "workflow_step",
          keyData: {
            title,
            bluf,
            stepGroup: group,
            totalSteps: steps.length,
            stepNumbers: `${i + 1}${group.length > 1 ? `-${i + 2}` : ""}`,
          },
          consumed: false,
        });
      }
    }
  }

  // term_explained — glossary
  if (cat === "glossary") {
    const term = String(fm["term"] ?? title);
    const shortDef = String(fm["shortDefinition"] ?? "");
    const longDef = String(fm["longDefinition"] ?? "");
    const examples = fm["examples"] as string[] | undefined;
    entries.push({
      id: makeId("term_explained", cat, fileSlug),
      sourceFile: path.relative(process.cwd(), filePath),
      postType: "term_explained",
      keyData: {
        term,
        shortDef,
        longDef: longDef.slice(0, 600),
        examples: examples?.slice(0, 2) ?? [],
      },
      consumed: false,
    });
  }

  // tool_teardown — pricing-breakdowns and alternatives
  if (cat === "pricing-breakdowns" || cat === "alternatives") {
    entries.push({
      id: makeId("tool_teardown", cat, fileSlug),
      sourceFile: path.relative(process.cwd(), filePath),
      postType: "tool_teardown",
      keyData: { title, bluf, bodySnippet: stripMarkdown(body).slice(0, 600) },
      consumed: false,
    });
  }

  // vertical_hook — vertical-pages
  if (cat === "vertical-pages") {
    entries.push({
      id: makeId("vertical_hook", cat, fileSlug),
      sourceFile: path.relative(process.cwd(), filePath),
      postType: "vertical_hook",
      keyData: { title, bluf, bodySnippet: stripMarkdown(body).slice(0, 500) },
      consumed: false,
    });
  }

  // free_resource — lead-magnets
  if (cat === "lead-magnets") {
    const deliverableType = String(fm["deliverableType"] ?? "pdf");
    const deliverableUrl = String(fm["deliverableUrl"] ?? "");
    entries.push({
      id: makeId("free_resource", cat, fileSlug),
      sourceFile: path.relative(process.cwd(), filePath),
      postType: "free_resource",
      keyData: {
        title,
        bluf,
        deliverableType,
        deliverableUrl,
        bodySnippet: stripMarkdown(body).slice(0, 500),
      },
      consumed: false,
    });
  }

  // comparison_insight — comparisons
  if (cat === "comparisons") {
    const verdict = String(fm["verdict"] ?? "");
    const competitorA = fm["competitorA"] as { name: string; pricing: string } | undefined;
    const competitorB = fm["competitorB"] as { name: string; pricing: string } | undefined;
    if (verdict) {
      entries.push({
        id: makeId("comparison_insight", cat, fileSlug),
        sourceFile: path.relative(process.cwd(), filePath),
        postType: "comparison_insight",
        keyData: { title, verdict, competitorA, competitorB, bluf },
        consumed: false,
      });
    }
  }

  // question_post — personas
  if (cat === "personas") {
    entries.push({
      id: makeId("question_post", cat, fileSlug),
      sourceFile: path.relative(process.cwd(), filePath),
      postType: "question_post",
      keyData: { title, bluf, bodySnippet: stripMarkdown(body).slice(0, 500) },
      consumed: false,
    });
  }

  // product_insight — features
  if (cat === "features") {
    entries.push({
      id: makeId("product_insight", cat, fileSlug),
      sourceFile: path.relative(process.cwd(), filePath),
      postType: "product_insight",
      keyData: { title, bluf, bodySnippet: stripMarkdown(body).slice(0, 600) },
      consumed: false,
    });
  }

  // list_post — listicles
  if (cat === "listicles") {
    entries.push({
      id: makeId("list_post", cat, fileSlug),
      sourceFile: path.relative(process.cwd(), filePath),
      postType: "list_post",
      keyData: { title, bluf, bodySnippet: stripMarkdown(body).slice(0, 600) },
      consumed: false,
    });
  }

  return entries;
}

function buildArticleEntry(
  filePath: string,
  fm: Record<string, unknown>,
  body: string,
): ArticleQueueEntry | null {
  const cat = category(filePath);
  if (cat !== "guides" && cat !== "workflows") return null;

  const title = String(fm["title"] ?? "");
  const bluf = String(fm["bluf"] ?? "");
  if (!title || !bluf) return null;

  const fileSlug = slug(filePath);
  const bodySnippet = stripMarkdown(body).slice(0, 3000);

  return {
    id: makeId("article", cat, fileSlug),
    sourceFile: path.relative(process.cwd(), filePath),
    title,
    bluf,
    bodySnippet,
    consumed: false,
  };
}

function main() {
  const files = walkDir(CONTENT_DIR);
  console.log(`Scanning ${files.length} content files...`);

  const posts: PostQueueEntry[] = [];
  const articles: ArticleQueueEntry[] = [];

  let skipped = 0;
  for (const filePath of files) {
    const raw = fs.readFileSync(filePath, "utf-8");

    // Skip files with git merge conflict markers
    if (raw.includes("<<<<<<<") || raw.includes("=======\n") || raw.includes(">>>>>>>")) {
      skipped++;
      continue;
    }

    let fm: Record<string, unknown>;
    let body: string;
    try {
      const parsed = matter(raw);
      fm = parsed.data as Record<string, unknown>;
      body = parsed.content;
    } catch {
      skipped++;
      continue;
    }

    const postEntries = buildPostEntries(filePath, fm, body);
    posts.push(...postEntries);

    const articleEntry = buildArticleEntry(filePath, fm, body);
    if (articleEntry) articles.push(articleEntry);
  }
  if (skipped > 0) {
    console.log(`Skipped ${skipped} files (merge conflicts or parse errors).`);
  }

  // Shuffle both arrays so consecutive days get variety across categories
  for (let i = posts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = posts[i]!;
    posts[i] = posts[j]!;
    posts[j] = tmp;
  }
  for (let i = articles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = articles[i]!;
    articles[i] = articles[j]!;
    articles[j] = tmp;
  }

  // Preserve consumed flags from any existing queue.json so a rebuild does
  // not erase progress. Match by id.
  let preservedCount = 0;
  if (fs.existsSync(OUTPUT_FILE)) {
    try {
      const prev = JSON.parse(fs.readFileSync(OUTPUT_FILE, "utf-8")) as {
        posts?: { id: string; consumed?: boolean }[];
        articles?: { id: string; consumed?: boolean }[];
      };
      const consumedIds = new Set<string>();
      for (const p of prev.posts ?? []) if (p.consumed) consumedIds.add(p.id);
      for (const a of prev.articles ?? []) if (a.consumed) consumedIds.add(a.id);
      for (const p of posts) {
        if (consumedIds.has(p.id)) {
          p.consumed = true;
          preservedCount++;
        }
      }
      for (const a of articles) {
        if (consumedIds.has(a.id)) {
          a.consumed = true;
          preservedCount++;
        }
      }
    } catch {
      // Existing queue unreadable — start fresh.
    }
  }

  const queue: Queue = {
    posts,
    articles,
    builtAt: new Date().toISOString(),
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(queue, null, 2));
  if (preservedCount > 0) {
    console.log(`Preserved ${preservedCount} consumed flags from previous queue.`);
  }

  const byType: Record<string, number> = {};
  for (const p of posts) {
    byType[p.postType] = (byType[p.postType] ?? 0) + 1;
  }

  console.log(`\nQueue built:`);
  console.log(`  Posts: ${posts.length}`);
  console.log(`  Articles: ${articles.length}`);
  console.log(`  Days of content (10 posts/day): ${Math.floor(posts.length / 10)}`);
  console.log(`  Days of content (articles): ${articles.length}`);
  console.log(`\nPost breakdown by type:`);
  for (const [type, count] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type}: ${count}`);
  }
  console.log(`\nWritten to ${OUTPUT_FILE}`);
}

main();
