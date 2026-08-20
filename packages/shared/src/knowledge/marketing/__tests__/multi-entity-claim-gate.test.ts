import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MARKETING_KNOWLEDGE_INDEX } from "../../generated/indexes";

const FEATURE_CONTENT_DIR = resolve(process.cwd(), "src/knowledge/marketing/content/features");
const MULTI_ENTITY_PAGE = resolve(
  process.cwd(),
  "src/knowledge/marketing/content/features/multi-entity-consolidation.md",
);

const PUBLIC_FEATURE_PAGES = ["multi-entity-consolidation.md", "role-based-permissions.md"].map(
  (fileName) => ({
    fileName,
    source: readFileSync(resolve(FEATURE_CONTENT_DIR, fileName), "utf8"),
  }),
);

describe("multi-entity marketing claim gate", () => {
  it("keeps unsupported multi-entity claims out of published feature copy", () => {
    const source = readFileSync(MULTI_ENTITY_PAGE, "utf8");
    const entry = MARKETING_KNOWLEDGE_INDEX.entries.find(
      (candidate) => candidate.id === "features:multi-entity-consolidation",
    );

    expect(entry).toMatchObject({
      consumers: ["public-marketing", "ai-sdr"],
      visibility: "public",
      safety: "public-safe",
    });
    expect(source).toContain("status: planned");
    expect(source).toContain("not live yet");
    expect(source).toMatch(/^primaryCta:\s*contact$/m);
    expect(source).toMatch(/^ctaMode:\s*evaluate$/m);
    expect(source).toMatch(/^noindex:\s*true$/m);

    expect(source).not.toMatch(/^## How GrantPipe solves it$/m);
    expect(source).not.toMatch(/^primaryCta:\s*trial$/m);
    expect(source).not.toMatch(/^ctaMode:\s*convert$/m);
    expect(source).not.toMatch(/\bProfessional\b/i);
    expect(source).not.toMatch(/\bclient-only\b/i);
    expect(source).not.toMatch(/\bcross-entity\b/i);
    expect(source).not.toMatch(/\broll-?up\b/i);
    expect(source).not.toMatch(/intercompany\s+eliminat/i);
    expect(source).not.toMatch(/inter-entity\s+eliminat/i);
    expect(source).not.toMatch(/shared\s+donor/i);
    expect(source).not.toMatch(/separate\s+workspace/i);
    expect(source).not.toMatch(/workspace\s+switcher/i);
    expect(source).not.toMatch(/roles?\s+per\s+entity/i);
    expect(source).not.toMatch(/available\s+on\s+Professional/i);
  });

  it("keeps shipped entity-switching and client-isolation claims out of public feature pages", () => {
    for (const { fileName, source } of PUBLIC_FEATURE_PAGES) {
      expect(source, fileName).not.toMatch(/workspace\s+switcher/i);
      expect(source, fileName).not.toMatch(/roles?\s+are\s+assigned\s+per\s+entity/i);
      expect(source, fileName).not.toMatch(/per-entity\s+role\s+assignment/i);
      expect(source, fileName).not.toMatch(/entity[-\s]specific\s+roles?/i);
      expect(source, fileName).not.toMatch(/role\s+assignment\s+by\s+entity/i);
      expect(source, fileName).not.toMatch(/role[-\s]per[-\s]entity\s+assignment/i);
      expect(source, fileName).not.toMatch(/roles?\s+by\s+entity/i);
      expect(source, fileName).not.toMatch(/\bclient-only\b/i);
      expect(source, fileName).not.toMatch(
        /see\s+only\s+what\s+their\s+role\s+on\s+that\s+entity\s+permits/i,
      );
    }
  });
});
