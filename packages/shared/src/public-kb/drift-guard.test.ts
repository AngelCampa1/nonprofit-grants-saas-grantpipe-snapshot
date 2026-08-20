import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(import.meta.dirname, "../../../..");
const scannedRoots = ["apps", "packages", "scripts"];
const scannedExtensions = [".ts", ".tsx", ".astro", ".mjs", ".md"];
const canonicalFiles = new Set([
  "apps/site/public/AGENTS.md",
  "packages/shared/src/knowledge/marketing/index.ts",
  "packages/shared/src/pricing.ts",
  "packages/shared/src/public-kb/public-kb.test.ts",
  // Generator for the public AGENTS artifact. It derives pricing and contact
  // details from canonical shared sources before writing the public file.
  "scripts/generate-public-agents.ts",
  // Build-time deploy script that injects the worker-boundary signup redirect.
  // It is the canonical source of that redirect target, not drift-prone KB copy.
  "scripts/patch-site-canonical-host-redirect.ts",
]);
const generatedOrTestPattern = /(\.test\.|\.fixture\.|generated[\\/]|linkedin-output[\\/])/;
const disallowedPublicFacts = [
  "hello@grantpipe.com",
  "support@grantpipe.com",
  "angel.campa@grantpipe.com",
  "GrantPipe <",
  "GrantPipe Feedback <",
  "https://app.grantpipe.com/signup",
  "https://grantpipe.com/logo-email.png",
  "Start your 1-month free trial",
];
const publicKbSurfacePattern =
  /^(apps\/site\/public\/AGENTS\.md|packages\/shared\/src\/knowledge\/marketing\/content\/|packages\/shared\/src\/public-kb\/)/;
const disallowedPublicKbImplementationFacts = [
  "deleted_at",
  "encoded in the signed token",
  "expiry is encoded",
  "expiry timestamp",
  "fails verification",
  "forged",
  "HMAC",
  "JSONB",
  "row-level multi-tenancy middleware",
  "query layer",
  "no user interface or API path",
  "server-side secret",
  "session ID",
  "session token",
  "token's signature",
];

function walkFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry === "dist" || entry === ".astro") continue;
      files.push(...walkFiles(fullPath));
      continue;
    }
    if (scannedExtensions.some((extension) => fullPath.endsWith(extension))) {
      files.push(fullPath);
    }
  }
  return files;
}

describe("public KB drift guard", () => {
  it("keeps canonical public facts out of production source files", () => {
    const offenders = scannedRoots
      .flatMap((root) => walkFiles(resolve(repoRoot, root)))
      .map((filePath) => relative(repoRoot, filePath).replace(/\\/g, "/"))
      .filter((filePath) => !canonicalFiles.has(filePath))
      .filter((filePath) => !generatedOrTestPattern.test(filePath))
      .flatMap((filePath) => {
        const source = readFileSync(resolve(repoRoot, filePath), "utf8");
        const facts = publicKbSurfacePattern.test(filePath)
          ? [...disallowedPublicFacts, ...disallowedPublicKbImplementationFacts]
          : disallowedPublicFacts;
        return facts.filter((fact) => source.includes(fact)).map((fact) => `${filePath}: ${fact}`);
      });

    expect(offenders).toEqual([]);
  }, 30_000);
});
