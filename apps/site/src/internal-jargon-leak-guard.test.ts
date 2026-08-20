import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// fileURLToPath yields a native path; URL.pathname would prepend a leading
// slash on Windows ("/C:/...") that breaks fs calls.
const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const contentRoot = join(
  repoRoot,
  "packages",
  "shared",
  "src",
  "knowledge",
  "marketing",
  "content",
);

// Internal marketing-operations vocabulary that must never reach reader-facing
// copy. These are production/taxonomy labels, not language a nonprofit operator
// would ever use to describe a resource. The funnel taxonomy still lives in code
// as the `buyerStage` field and `siteConfig.funnel.*` keys — those are exempt
// because they are code identifiers, not rendered prose (see CLAUDE.md).
const INTERNAL_TERMS: { label: string; pattern: RegExp }[] = [
  { label: "lead magnet", pattern: /\blead[-\s]magnets?\b/i },
  { label: "funnel acronym (TOFU/MOFU/BOFU)", pattern: /\b(?:tofu|mofu|bofu)\b/i },
  {
    label: "funnel-stage phrase",
    pattern: /\b(?:top|middle|bottom)[-\s]of[-\s]funnel\b/i,
  },
  { label: "content upgrade", pattern: /\bcontent upgrade\b/i },
  { label: "gated content", pattern: /\bgated content\b/i },
  { label: "buyer stage (prose)", pattern: /\bbuyer[-\s]?stage\b/i },
];

function listMarkdownFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...listMarkdownFiles(full));
    } else if (entry.endsWith(".md") || entry.endsWith(".mdx")) {
      out.push(full);
    }
  }
  return out;
}

interface ParsedDoc {
  frontmatter: string;
  body: string;
}

function parse(raw: string): ParsedDoc {
  if (raw.startsWith("---")) {
    const end = raw.indexOf("\n---", 3);
    if (end !== -1) {
      const afterFence = raw.indexOf("\n", end + 1);
      return {
        frontmatter: raw.slice(0, end),
        body: afterFence === -1 ? "" : raw.slice(afterFence + 1),
      };
    }
  }
  return { frontmatter: "", body: raw };
}

// Frontmatter `tags:` values become `<meta property="article:tag">` in the
// public HTML head, so a tag carrying an internal label leaks just like prose.
function tagValues(frontmatter: string): string[] {
  const lines = frontmatter.split(/\r?\n/);
  const values: string[] = [];
  let inTags = false;
  for (const line of lines) {
    if (/^tags:\s*$/.test(line)) {
      inTags = true;
      continue;
    }
    if (inTags) {
      const match = /^\s*-\s*"?([^"]+)"?\s*$/.exec(line);
      if (match && match[1] !== undefined) {
        values.push(match[1]);
      } else if (/^\S/.test(line)) {
        inTags = false;
      }
    }
  }
  return values;
}

describe("internal jargon leak guard", () => {
  const files = listMarkdownFiles(contentRoot);

  it("ships published content without internal funnel/production jargon", () => {
    const offenders: string[] = [];

    for (const file of files) {
      const rel = file.slice(repoRoot.length + 1).replace(/\\/g, "/");
      const { frontmatter, body } = parse(readFileSync(file, "utf8"));

      body.split(/\r?\n/).forEach((line, index) => {
        for (const term of INTERNAL_TERMS) {
          if (term.pattern.test(line)) {
            offenders.push(`${rel}:${index + 1} [${term.label}] ${line.trim().slice(0, 120)}`);
          }
        }
      });

      for (const tag of tagValues(frontmatter)) {
        for (const term of INTERNAL_TERMS) {
          if (term.pattern.test(tag)) {
            offenders.push(`${rel} (tag) [${term.label}] "${tag}"`);
          }
        }
      }
    }

    expect(
      offenders,
      `Published content still contains internal-only jargon (see CLAUDE.md):\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
