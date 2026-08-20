#!/usr/bin/env node
/**
 * Design-system guardrail: fails if staged (or all, with --all) files under apps/** or
 * packages/ui/src/site/** contain forbidden color/token patterns in class/className strings.
 *
 * Complements the ESLint no-restricted-syntax rules in eslint.config.js by also covering
 * .astro files and CSS imports/class attributes that ESLint cannot easily parse.
 *
 * Usage:
 *   node scripts/check-design-tokens.mjs            # check staged files
 *   node scripts/check-design-tokens.mjs --all      # check every tracked source file
 *
 * Exit codes: 0 = clean, 1 = violations found.
 */
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const GLOB_RE = /\.(tsx|ts|jsx|js|astro)$/;

// Bracket [var(--*)] tokens that bypass the semantic utility:
const FORBIDDEN_CLASS_TOKENS = [
  /\[var\(--color-/,
  /\[var\(--surface-/,
  /\[var\(--shadow-/,
  /\[var\(--radius-/,
  /\[var\(--animate-/,
  /\[var\(--font-/,
];

const FORBIDDEN_HEX_IN_CLASS = /\[#[0-9a-fA-F]{3,8}\]/;

const FORBIDDEN_PALETTE =
  /\b(bg|text|border|ring|fill|stroke|decoration|outline|from|to|via)-(amber|blue|green|rose|red|slate|gray|zinc|yellow|orange|indigo|violet|purple|pink|cyan|teal|emerald|lime|sky|fuchsia)-[0-9]+/;

// Files permitted to contain brand/user hex colors or raw palette references.
// Use forward slashes — we normalize input before comparing.
const ALLOWLIST_FILES = new Set([
  // Google logo brand hex
  "apps/web/src/routes/login.tsx",
  "apps/web/src/routes/signup.tsx",
  // User-configured tag/pipeline colors (stored as hex from user input)
  "apps/web/src/components/donors/pipeline-board.tsx",
  "apps/web/src/components/donors/tag-picker.tsx",
  // Token/theme definitions
  "packages/ui/src/globals.css",
  "packages/ui/src/site/styles/globals.css",
  "apps/site/src/styles/global.css",
  "apps/site/src/config/site.ts",
  // Theme CSS generator consumes raw palette class strings as data (not rendered)
  "packages/ui/src/site/lib/generate-theme-css.ts",
  "packages/ui/src/site/lib/generate-theme-css.test.ts",
]);

// Directory allowlist — anything under these paths is skipped.
const ALLOWLIST_DIRS = [
  "packages/ui/src/components/", // design-system primitives can define raw colors
  "docs/",
];

function normalize(p) {
  return p.split(path.sep).join("/");
}

function isAllowlisted(file) {
  const norm = normalize(file);
  if (ALLOWLIST_FILES.has(norm)) return true;
  for (const dir of ALLOWLIST_DIRS) {
    if (norm.startsWith(dir)) return true;
  }
  return false;
}

function listFiles(mode) {
  if (mode === "--all") {
    const out = execSync("git ls-files apps packages", { encoding: "utf8" });
    return out.split("\n").filter(Boolean);
  }
  const out = execSync("git diff --cached --name-only --diff-filter=ACMR", {
    encoding: "utf8",
  });
  return out.split("\n").filter(Boolean);
}

// Pull each class/className attribute string value (supports JSX, Astro, template strings).
function extractClassAttributes(line) {
  const results = [];
  // class="..."  class='...'  class={`...`}  className="..." etc.
  const re =
    /\bclass(?:Name)?\s*=\s*(?:\{`([^`]*)`\}|"([^"]*)"|'([^']*)'|\{"([^"]*)"\}|\{'([^']*)'\})/g;
  let m;
  while ((m = re.exec(line)) !== null) {
    const value = m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5];
    if (value) results.push(value);
  }
  return results;
}

export function checkContents(file, contents) {
  const issues = [];
  const lines = contents.split("\n");
  lines.forEach((line, i) => {
    const attrs = extractClassAttributes(line);
    for (const attr of attrs) {
      for (const re of FORBIDDEN_CLASS_TOKENS) {
        if (re.test(attr)) {
          issues.push({ file, line: i + 1, snippet: line.trim(), match: re.source });
        }
      }
      if (FORBIDDEN_HEX_IN_CLASS.test(attr)) {
        issues.push({ file, line: i + 1, snippet: line.trim(), match: "hex-in-class" });
      }
      if (FORBIDDEN_PALETTE.test(attr)) {
        issues.push({ file, line: i + 1, snippet: line.trim(), match: "raw-palette" });
      }
    }
  });
  return issues;
}

export function run(argv) {
  const mode = argv.includes("--all") ? "--all" : "staged";
  const files = listFiles(mode).filter((f) => GLOB_RE.test(f));
  const allIssues = [];
  for (const file of files) {
    if (isAllowlisted(file)) continue;
    // Only check files in apps/** or packages/ui/src/site/**
    const norm = normalize(file);
    if (!norm.startsWith("apps/") && !norm.startsWith("packages/ui/src/site/")) continue;
    if (!existsSync(file)) continue;
    let contents;
    try {
      contents = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    allIssues.push(...checkContents(file, contents));
  }
  return allIssues;
}

function main() {
  const issues = run(process.argv.slice(2));
  if (issues.length > 0) {
    console.error("\x1b[31mDesign token violations:\x1b[0m");
    for (const issue of issues) {
      console.error(`  ${issue.file}:${issue.line}  [${issue.match}]  ${issue.snippet}`);
    }
    console.error(
      "\nUse semantic tokens from packages/ui/src/globals.css (bg-surface-*, text-success-*, text-destructive, etc.).",
    );
    console.error(
      "If the occurrence is legitimate (brand logo, user-configured color, theme generator data),",
    );
    console.error("add the file to ALLOWLIST_FILES in scripts/check-design-tokens.mjs.");
    process.exit(1);
  }
}

// Run when invoked directly (not when imported by tests).
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
const thisPath = path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
if (invokedPath === thisPath) {
  main();
}
