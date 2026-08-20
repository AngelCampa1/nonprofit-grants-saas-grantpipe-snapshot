import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import {
  LEAD_MAGNET_SEQUENCE_METADATA,
  LEAD_MAGNET_SLUGS,
  leadMagnetAsset,
} from "../../../packages/shared/src/constants/lead-magnets";
import { marketingContentDirectory } from "./lib/marketing-content-root";

const CONTENT_DIR = join(marketingContentDirectory, "lead-magnets");
const LEDGER_PATH = join(
  process.cwd(),
  "..",
  "..",
  "docs",
  "content-research",
  "lead-magnet-quality-audit-2026-05.md",
);

type LedgerRow = {
  asset: string;
  route: string;
  r2Key: string;
  sequenceSlug: string;
  slug: string;
  sources: number;
  stage: string;
  title: string;
  topic: string;
};

function frontmatter(source: string): string {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    throw new Error("Missing frontmatter");
  }
  return match[1]!;
}

function scalar(source: string, field: string): string | null {
  const match = source.match(new RegExp(`^${field}:\\s*(?:"([^"]+)"|'([^']+)'|([^\\n#]+))$`, "m"));
  return match?.[1]?.trim() ?? match?.[2]?.trim() ?? match?.[3]?.trim() ?? null;
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

function parseAuditLedger(): Map<string, LedgerRow> {
  const ledger = readFileSync(LEDGER_PATH, "utf-8");
  const rows = new Map<string, LedgerRow>();

  for (const line of ledger.split(/\r?\n/)) {
    if (!line.startsWith("| ") || line.includes(" --- ")) {
      continue;
    }
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (cells[0] === "Slug" || cells[0]?.startsWith("---") || cells.length < 13) {
      continue;
    }

    rows.set(cells[0]!, {
      slug: cells[0]!,
      title: cells[1]!,
      asset: cells[2]!,
      sequenceSlug: cells[4]!,
      stage: cells[5]!,
      topic: cells[6]!,
      route: cells[7]!,
      r2Key: cells[8]!,
      sources: Number(cells[11]),
    });
  }

  return rows;
}

describe("lead magnet quality audit ledger", () => {
  it("stays aligned with current lead magnet source and sequence metadata", () => {
    const rows = parseAuditLedger();

    expect([...rows.keys()].sort()).toEqual([...LEAD_MAGNET_SLUGS].sort());

    for (const slug of LEAD_MAGNET_SLUGS) {
      const source = readFileSync(join(CONTENT_DIR, `${slug}.md`), "utf-8");
      const fm = frontmatter(source);
      const asset = leadMagnetAsset(slug);
      const sequence = LEAD_MAGNET_SEQUENCE_METADATA[slug];
      const row = rows.get(slug);

      expect(row, slug).toBeDefined();
      expect(row?.title, slug).toBe(scalar(fm, "title"));
      expect(row?.asset, slug).toBe(asset.extension);
      expect(row?.sequenceSlug, slug).toBe(sequence.sequenceSlug);
      expect(row?.stage, slug).toBe(sequence.buyerStage);
      expect(row?.topic, slug).toBe(sequence.topicCluster);
      expect(row?.route, slug).toBe(scalar(fm, "deliverableUrl"));
      expect(row?.r2Key, slug).toBe(asset.r2Key);
      expect(row?.sources, slug).toBe(listValues(fm, "sourceUrls").length);
    }
  });
});
