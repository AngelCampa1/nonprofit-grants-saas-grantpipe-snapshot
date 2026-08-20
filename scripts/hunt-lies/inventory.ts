import { createHash } from "node:crypto";
import { readdirSync, readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import type { Claim, ClaimKind, ClaimManifest } from "./manifest-schema.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");
const MARKETING_CONTENT_DIR = resolve(REPO_ROOT, "packages/shared/src/knowledge/marketing/content");
const KEY_STATS_FILE = resolve(REPO_ROOT, "apps/site/src/lib/key-statistics.ts");
const SITE_CONFIG_DIR = resolve(REPO_ROOT, "apps/site/src/config");
const SITE_PAGES_DIR = resolve(REPO_ROOT, "apps/site/src/pages");
const API_SRC_DIR = resolve(REPO_ROOT, "apps/api/src");
const AUDIT_DIR = resolve(REPO_ROOT, "audit");

const INLINE_NUMERIC =
  /\b\d{1,3}(?:[.,]\d+)?%(?!\w)|[$]\d[\d,]*(?:\s*(?:billion|million|trillion|thousand|k|m|b))?/gi;
const REGULATORY =
  /\bFASB ASC \d+(?:-\d+(?:-\d+)?)?\b|\b2 CFR 200\.\d+\b|\b45 CFR 75\b|\bIRS Form 990(?:-[A-Z]+)?\b|\bOMB Circular [A-Z]-\d+\b|\bSingle Audit\b|\bUniform Guidance\b/g;

function walk(dir: string, exts: string[]): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".turbo")
        continue;
      out.push(...walk(full, exts));
    } else if (exts.includes(extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

function hashId(filepath: string, ordinal: number): string {
  return createHash("sha1").update(`${filepath}#${ordinal}`).digest("hex").slice(0, 16);
}

function lineNumberOf(source: string, offset: number): number {
  return source.slice(0, offset).split(/\r?\n/).length;
}

function contextOf(source: string, offset: number, length: number): string {
  const lines = source.split(/\r?\n/);
  const startLine = source.slice(0, offset).split(/\r?\n/).length - 1;
  const endLine = source.slice(0, offset + length).split(/\r?\n/).length - 1;
  const ctxStart = Math.max(0, startLine - 2);
  const ctxEnd = Math.min(lines.length, endLine + 3);
  return lines.slice(ctxStart, ctxEnd).join("\n").slice(0, 400);
}

function pushClaim(out: Claim[], data: Omit<Claim, "id">): void {
  const id = hashId(data.filepath, out.length);
  out.push({ id, ...data });
}

function inventoryMarkdownFile(filepath: string, claims: Claim[]): void {
  const source = readFileSync(filepath, "utf8");
  const parsed = matter(source);
  const fm = parsed.data as Record<string, unknown>;
  const rel = relative(REPO_ROOT, filepath).replace(/\\/g, "/");
  const collection = rel.split("/")[6] ?? "unknown";

  if (Array.isArray(fm.statistics)) {
    (fm.statistics as Array<Record<string, unknown>>).forEach((s, idx) => {
      const stat = typeof s.stat === "string" ? s.stat : "";
      if (!stat) return;
      pushClaim(claims, {
        filepath: rel,
        collection,
        kind: "frontmatter-stat",
        stat,
        source: typeof s.source === "string" ? s.source : undefined,
        sourceUrl: typeof s.sourceUrl === "string" ? s.sourceUrl : undefined,
        lineNumber: 0,
        context: `frontmatter.statistics[${idx}]`,
      });
    });
  }

  const body = parsed.content;
  for (const m of body.matchAll(INLINE_NUMERIC)) {
    const idx = m.index ?? 0;
    pushClaim(claims, {
      filepath: rel,
      collection,
      kind: "inline-numeric",
      stat: m[0],
      lineNumber: lineNumberOf(body, idx),
      context: contextOf(body, idx, m[0].length),
    });
  }
  for (const m of body.matchAll(REGULATORY)) {
    const idx = m.index ?? 0;
    pushClaim(claims, {
      filepath: rel,
      collection,
      kind: "inline-regulatory",
      stat: m[0],
      lineNumber: lineNumberOf(body, idx),
      context: contextOf(body, idx, m[0].length),
    });
  }
}

function inventoryKeyStatistics(claims: Claim[]): void {
  if (!existsSync(KEY_STATS_FILE)) return;
  const source = readFileSync(KEY_STATS_FILE, "utf8");
  const rel = relative(REPO_ROOT, KEY_STATS_FILE).replace(/\\/g, "/");
  const entryRe =
    /\{\s*stat:\s*"([^"]+)",\s*source:\s*"([^"]+)"(?:,\s*sourceUrl:\s*"([^"]+)")?\s*,?\s*\}/g;
  for (const m of source.matchAll(entryRe)) {
    pushClaim(claims, {
      filepath: rel,
      collection: "registry",
      kind: "key-statistic",
      stat: m[1] ?? "",
      source: m[2],
      sourceUrl: m[3],
      lineNumber: lineNumberOf(source, m.index ?? 0),
      context: contextOf(source, m.index ?? 0, m[0].length),
    });
  }
}

function inventoryTsCopy(filepath: string, claims: Claim[], kind: ClaimKind): void {
  if (!existsSync(filepath)) return;
  const source = readFileSync(filepath, "utf8");
  const rel = relative(REPO_ROOT, filepath).replace(/\\/g, "/");
  const stringRe = /(["'`])((?:(?!\1)[\s\S])*?)\1/g;
  for (const m of source.matchAll(stringRe)) {
    const text = m[2] ?? "";
    if (text.length < 12) continue;
    if (!INLINE_NUMERIC.test(text) && !REGULATORY.test(text)) {
      INLINE_NUMERIC.lastIndex = 0;
      REGULATORY.lastIndex = 0;
      continue;
    }
    INLINE_NUMERIC.lastIndex = 0;
    REGULATORY.lastIndex = 0;
    pushClaim(claims, {
      filepath: rel,
      collection: kind === "page-copy" ? "page" : "config",
      kind,
      stat: text,
      lineNumber: lineNumberOf(source, m.index ?? 0),
      context: contextOf(source, m.index ?? 0, m[0].length),
    });
  }
}

function inventoryAstroPages(claims: Claim[]): void {
  for (const file of walk(SITE_PAGES_DIR, [".astro"])) {
    const source = readFileSync(file, "utf8");
    const rel = relative(REPO_ROOT, file).replace(/\\/g, "/");
    for (const m of source.matchAll(INLINE_NUMERIC)) {
      pushClaim(claims, {
        filepath: rel,
        collection: "page",
        kind: "page-copy",
        stat: m[0],
        lineNumber: lineNumberOf(source, m.index ?? 0),
        context: contextOf(source, m.index ?? 0, m[0].length),
      });
    }
    for (const m of source.matchAll(REGULATORY)) {
      pushClaim(claims, {
        filepath: rel,
        collection: "page",
        kind: "inline-regulatory",
        stat: m[0],
        lineNumber: lineNumberOf(source, m.index ?? 0),
        context: contextOf(source, m.index ?? 0, m[0].length),
      });
    }
  }
}

function main(): void {
  const claims: Claim[] = [];

  for (const md of walk(MARKETING_CONTENT_DIR, [".md"])) {
    inventoryMarkdownFile(md, claims);
  }

  inventoryKeyStatistics(claims);

  for (const cfgFile of [
    "market-facts.ts",
    "hub-faqs.ts",
    "personas.ts",
    "grant-recipient-seo.ts",
    "site.ts",
  ]) {
    inventoryTsCopy(join(SITE_CONFIG_DIR, cfgFile), claims, "config-claim");
  }

  inventoryAstroPages(claims);

  for (const tsFile of walk(API_SRC_DIR, [".ts"]).filter((f) =>
    /(email|lead|nurture|template)/i.test(f),
  )) {
    inventoryTsCopy(tsFile, claims, "email-template");
  }

  const manifest: ClaimManifest = {
    generatedAt: new Date().toISOString(),
    claimCount: claims.length,
    claims,
  };

  mkdirSync(AUDIT_DIR, { recursive: true });
  writeFileSync(join(AUDIT_DIR, "claims-manifest.json"), JSON.stringify(manifest, null, 2));

  const byCollection: Record<string, number> = {};
  for (const c of claims) byCollection[c.collection] = (byCollection[c.collection] ?? 0) + 1;
  const byKind: Record<string, number> = {};
  for (const c of claims) byKind[c.kind] = (byKind[c.kind] ?? 0) + 1;

  console.log(JSON.stringify({ claimCount: claims.length, byCollection, byKind }, null, 2));
}

main();
