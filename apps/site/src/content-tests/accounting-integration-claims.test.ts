import { readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const activeClaimRoots = [
  "../pages",
  "../../../../packages/shared/src/knowledge/marketing/content",
  "../../../../output/pdf",
] as const;

function collectClaimFiles(relativeRoot: string): string[] {
  const root = fileURLToPath(new URL(relativeRoot, import.meta.url));
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && [".astro", ".html", ".md"].includes(extname(entry.name)))
    .map((entry) => join(entry.parentPath, entry.name));
}

const activeClaimFiles = activeClaimRoots.flatMap(collectClaimFiles);

const forbiddenClaims = [
  /GrantPipe pulls? (?:source )?data/i,
  /GrantPipe starts with read-only accounting ingestion/i,
  /GrantPipe (?:provides[^.]+and )?integrates with (?:Aplos|accounting systems|your general ledger)/i,
  /reconfigured in GrantPipe/i,
  /QuickBooks Online read-only ingestion/i,
  /real-time spend-to-date from the accounting connection/i,
  /Both rely on integration to (?:Aplos|QuickBooks)/i,
  /works alongside (?:QuickBooks|Sage Intacct)/i,
  /works with QuickBooks/i,
  /QuickBooks-friendly/i,
  /GrantPipe (?:tracks and )?(?:reconciles|surfaces)[^.]+source data/i,
  /integrates? with (?:your existing )?accounting systems?/i,
  /reconciliation is automated rather than manual/i,
  /(?:on top of|layered over) QuickBooks/i,
] as const;

describe("external accounting integration claims", () => {
  it.each(activeClaimFiles)("does not promise live sync in %s", (filePath) => {
    const source = readFileSync(filePath, "utf8");

    for (const claim of forbiddenClaims) {
      expect(source, `${filePath} contains a retired accounting integration claim`).not.toMatch(
        claim,
      );
    }
  });
});
