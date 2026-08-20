import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import {
  ACTIVE_LEAD_MAGNET_SLUGS,
  LEAD_MAGNET_SLUGS,
  LEAD_MAGNET_SEQUENCE_METADATA,
  LEAD_MAGNET_TITLES,
  NON_PDF_LEAD_MAGNET_SLUGS,
  PROMOTED_PDF_LEAD_MAGNET_SLUGS,
  leadMagnetAsset,
  type LeadMagnetSlug,
} from "../../../packages/shared/src/constants/lead-magnets";
import { buildManifestEntries, OUTPUT_DIR_NAME } from "../scripts/build-lead-magnet-pdfs.js";
import { makeDeliveryStep, magnetTitle } from "../../api/src/domains/leads/nurture-copy";
import { marketingContentDirectory } from "./lib/marketing-content-root";

const CONTENT_DIR = join(marketingContentDirectory, "lead-magnets");
const OUTPUT_DIR = fileURLToPath(new URL(`../${OUTPUT_DIR_NAME}`, import.meta.url));
const SEQUENCER_SOURCE = readFileSync(
  fileURLToPath(new URL("../../api/src/domains/leads/sequencer.ts", import.meta.url)),
  "utf-8",
);
const LEAD_MAGNET_PAGE_SOURCE = readFileSync(
  fileURLToPath(
    new URL("../../../packages/ui/src/site/components/lead-magnet-page.astro", import.meta.url),
  ),
  "utf-8",
);
const FREE_DYNAMIC_PAGE_SOURCE = readFileSync(
  fileURLToPath(new URL("../src/pages/free/[slug].astro", import.meta.url)),
  "utf-8",
);
const FREE_HUB_PAGE_SOURCE = readFileSync(
  fileURLToPath(new URL("../src/pages/free/[...page].astro", import.meta.url)),
  "utf-8",
);
const PLACEHOLDER_PATTERNS = [/TODO/i, /TBD/i, /lorem ipsum/i, /coming soon/i, /placeholder/i];
const AI_SLOP_PATTERNS = [
  /\bdelve\b/i,
  /\btapestry\b/i,
  /in today'?s (?:fast-paced|digital|complex)/i,
  /navigate the complexities/i,
  /\bseamlessly\b/i,
  /\brobust\b/i,
];
const ARTIFACT_PATTERNS = [
  /\bchecklist\b/i,
  /\bworksheet\b/i,
  /\btemplate\b/i,
  /\bscorecard\b/i,
  /\bcalculator\b/i,
  /\btracker\b/i,
  /\bcalendar\b/i,
  /\bmap\b/i,
  /\bplaybook\b/i,
  /\btimeline\b/i,
  /\btable\b/i,
  /\bscript\b/i,
  /\brubric\b/i,
  /\bformula\b/i,
];
const TOPIC_SOURCE_HOSTS = [
  {
    pattern: /targetKeyword:\s*["']donor retention|^title:\s*["'].*Donor Retention/im,
    hosts: ["publications.fepreports.org", "afpglobal.org", "givingtuesday.org"],
  },
];
const NO_GENERAL_SOLICITATION_REGISTRATION_SLUGS = [
  "arizona-compliance-checklist",
  "indiana-compliance-checklist",
  "iowa-compliance-checklist",
] as const satisfies ReadonlyArray<LeadMagnetSlug>;
const NO_GENERAL_SOLICITATION_REGISTRATION_PATTERNS = [
  /must register before fundraising/i,
  /before solicitation begins/i,
  /before any solicitation begins/i,
  /regulates charitable solicitation/i,
  /solicitation begins the day/i,
  /suspend solicitation authority/i,
  /loss of solicitation authority/i,
  /initial registration filed before solicitation/i,
];
const UNSUPPORTED_FUNDER_MAP_CLAIM_PATTERNS = [
  /\b(?:20|25)\s+largest\b/i,
  /ranked by FY?2024 distributions/i,
  /collectively distribute over/i,
];

function publicLeadMagnetSlugs(): string[] {
  return readdirSync(CONTENT_DIR)
    .filter((filename) => filename.endsWith(".md"))
    .map((filename) => filename.replace(/\.md$/, ""))
    .sort();
}

function readLeadMagnet(slug: LeadMagnetSlug): string {
  const path = join(CONTENT_DIR, `${slug}.md`);
  if (!existsSync(path)) {
    throw new Error(`Missing lead magnet content file: ${path}`);
  }
  return readFileSync(path, "utf-8");
}

function frontmatter(source: string): string {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    throw new Error("Missing frontmatter");
  }
  return match[1]!;
}

function body(source: string): string {
  const match = source.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    throw new Error("Missing body");
  }
  return match[1]!;
}

function scalar(source: string, field: string): string | null {
  const match = source.match(new RegExp(`^${field}:\\s*(?:"([^"]+)"|'([^']+)'|([^\\n#]+))$`, "m"));
  return match?.[1]?.trim() ?? match?.[2]?.trim() ?? match?.[3]?.trim() ?? null;
}

function buyerStage(source: string): string | null {
  return scalar(source, "buyerStage") ?? scalar(source, "stage");
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

describe("lead magnet delivery contract", () => {
  it("promotes every PDF lead magnet and excludes non-PDF deliverables", () => {
    expect(PROMOTED_PDF_LEAD_MAGNET_SLUGS).toEqual(
      ACTIVE_LEAD_MAGNET_SLUGS.filter(
        (slug) => !(NON_PDF_LEAD_MAGNET_SLUGS as ReadonlyArray<string>).includes(slug),
      ),
    );
    expect(publicLeadMagnetSlugs()).toEqual([...LEAD_MAGNET_SLUGS].sort());
  });

  it("lists only the active library while keeping legacy pages routable", () => {
    expect(FREE_DYNAMIC_PAGE_SOURCE).not.toContain("ACTIVE_LEAD_MAGNET_SLUGS");
    expect(FREE_DYNAMIC_PAGE_SOURCE).toContain(
      'getContentEntrySlug(entry) !== "nonprofit-crm-cost-calculator"',
    );
    expect(FREE_HUB_PAGE_SOURCE).toContain("ACTIVE_LEAD_MAGNET_SLUGS");
    expect(ACTIVE_LEAD_MAGNET_SLUGS).toHaveLength(24);
    expect(ACTIVE_LEAD_MAGNET_SLUGS).not.toContain("major-donor-cultivation-playbook");
    expect(ACTIVE_LEAD_MAGNET_SLUGS).not.toContain("board-fundraising-toolkit");
  });

  it("keeps lead magnet pages mobile-readable and points to a next step", () => {
    expect(LEAD_MAGNET_PAGE_SOURCE).toContain(".lead-magnet-body :global(table)");
    expect(LEAD_MAGNET_PAGE_SOURCE).toContain(".lead-magnet-body :global(th)");
    expect(LEAD_MAGNET_PAGE_SOURCE).toContain(".lead-magnet-body :global(td)");
    expect(LEAD_MAGNET_PAGE_SOURCE).toContain("overflow-x: auto");
    expect(LEAD_MAGNET_PAGE_SOURCE).toContain('data-section="lead-magnet-next-step"');
    expect(LEAD_MAGNET_PAGE_SOURCE).toContain("Start your free trial");
  });

  it("has a high-quality content source for every supported lead magnet", () => {
    for (const slug of LEAD_MAGNET_SLUGS) {
      const source = readLeadMagnet(slug);
      const fm = frontmatter(source);
      const markdownBody = body(source);
      const headings = markdownBody.match(/^##\s+/gm) ?? [];
      const asset = leadMagnetAsset(slug);
      const expectedDeliverableType = asset.extension === "xlsx" ? "sheet" : "pdf";

      expect(scalar(fm, "title")?.length ?? 0, slug).toBeGreaterThan(12);
      expect(scalar(fm, "deliverableType"), slug).toBe(expectedDeliverableType);
      if (asset.extension === "pdf") {
        expect(scalar(fm, "deliverableUrl"), slug).toBe(`/downloads/${slug}.pdf`);
      } else {
        // Non-PDF deliverables are gated behind the /free/ landing page rather
        // than a direct /downloads/{slug}.pdf link.
        expect(scalar(fm, "deliverableUrl"), slug).toBe(`/free/${slug}/`);
      }
      expect(scalar(fm, "bluf")?.length ?? 0, slug).toBeGreaterThan(120);
      expect(scalar(fm, "lastReviewedAt"), slug).toBe("2026-05-24");
      expect(scalar(fm, "verifiedAt"), slug).toBe("2026-05-24");
      expect(listValues(fm, "sourceUrls").length, slug).toBeGreaterThan(0);
      const sourceUrls = listValues(fm, "sourceUrls");
      for (const sourceUrl of listValues(fm, "sourceUrls")) {
        expect(sourceUrl, slug).toMatch(/^https:\/\//);
      }
      for (const topicSource of TOPIC_SOURCE_HOSTS) {
        if (topicSource.pattern.test(source)) {
          expect(
            sourceUrls.some((sourceUrl) =>
              topicSource.hosts.some((host) => sourceUrl.includes(host)),
            ),
            slug,
          ).toBe(true);
        }
      }
      expect(markdownBody.trim().length, slug).toBeGreaterThan(3500);
      expect(headings.length, slug).toBeGreaterThanOrEqual(4);
      expect(
        ARTIFACT_PATTERNS.some((pattern) => pattern.test(markdownBody)),
        slug,
      ).toBe(true);
      for (const pattern of PLACEHOLDER_PATTERNS) {
        expect(source, `${slug} should not contain ${pattern}`).not.toMatch(pattern);
      }
      for (const pattern of AI_SLOP_PATTERNS) {
        expect(source, `${slug} should not contain ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it("generates a manifest entry with the expected R2 key for every lead magnet", () => {
    const filenames = readdirSync(CONTENT_DIR).filter((filename) => filename.endsWith(".md"));
    const entries = buildManifestEntries(filenames, CONTENT_DIR, OUTPUT_DIR);

    expect(entries.map((entry) => entry.slug).sort()).toEqual([...LEAD_MAGNET_SLUGS].sort());
    for (const slug of LEAD_MAGNET_SLUGS) {
      const entry = entries.find((candidate) => candidate.slug === slug);
      const asset = leadMagnetAsset(slug);
      const isPromotedPdf =
        asset.extension === "pdf" &&
        (ACTIVE_LEAD_MAGNET_SLUGS as ReadonlyArray<string>).includes(slug);
      expect(entry, slug).toBeDefined();
      expect(entry?.fileName, slug).toBe(`${slug}.${asset.extension}`);
      expect(entry?.r2Key, slug).toBe(asset.r2Key);
      expect(entry?.assetType, slug).toBe(asset.extension);
      expect(basename(entry?.outputPath ?? ""), slug).toBe(`${slug}.${asset.extension}`);
      expect(entry?.promoted, slug).toBe(isPromotedPdf);
    }
  });

  it("keeps public lead magnet intent aligned with nurture sequence metadata", () => {
    for (const slug of LEAD_MAGNET_SLUGS) {
      const source = readLeadMagnet(slug);
      const fm = frontmatter(source);
      const metadata = LEAD_MAGNET_SEQUENCE_METADATA[slug];

      expect(buyerStage(fm), slug).toBe(metadata.buyerStage);
      const topicCluster = scalar(fm, "topicCluster");
      if (topicCluster) {
        expect(topicCluster, slug).toBe(metadata.topicCluster);
      }
    }
  });

  it("blocks corrected no-registration and funder-map overclaims from returning", () => {
    for (const slug of NO_GENERAL_SOLICITATION_REGISTRATION_SLUGS) {
      const source = readLeadMagnet(slug);

      for (const pattern of NO_GENERAL_SOLICITATION_REGISTRATION_PATTERNS) {
        expect(source, `${slug} should not contain ${pattern}`).not.toMatch(pattern);
      }
    }

    for (const slug of LEAD_MAGNET_SLUGS) {
      if (!slug.includes("funder-map")) {
        continue;
      }

      const source = readLeadMagnet(slug);
      for (const pattern of UNSUPPORTED_FUNDER_MAP_CLAIM_PATTERNS) {
        expect(source, `${slug} should not contain ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it("has a Resend delivery email and central follow-up nurture enrollment for every lead magnet", () => {
    expect(SEQUENCER_SOURCE).toContain("resolveLeadMagnetSequence");

    for (const slug of LEAD_MAGNET_SLUGS) {
      const title = magnetTitle(slug);
      const delivery = makeDeliveryStep(title);
      const downloadUrl = `https://app.grantpipe.com/api/public/downloads/token-${slug}`;

      expect(delivery.subject, slug).toBe(`Your ${LEAD_MAGNET_TITLES[slug]} from GrantPipe`);
      expect(
        delivery.html("https://app.grantpipe.com", "https://grantpipe.com/unsub", downloadUrl),
      ).toContain(downloadUrl);
      expect(
        delivery.text("https://app.grantpipe.com", "https://grantpipe.com/unsub", downloadUrl),
      ).toContain(downloadUrl);
    }
  });
});
