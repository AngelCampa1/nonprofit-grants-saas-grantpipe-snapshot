import { describe, expect, it } from "vitest";
import { ADMIN_ONLY_ROLES, EDITOR_UP_ROLES, READ_ONLY_ROLES, STANDARD_ROLES } from "./types";
import { GUIDE_KEYS } from "./validators/help";
import {
  APP_KNOWLEDGE_INDEX,
  MARKETING_KNOWLEDGE_INDEX,
  PUBLIC_KNOWLEDGE_INDEX,
  canUseHelpArticle,
  buildPublicKnowledgeJson,
  competitorProfiles,
  getCompetitorProfile,
  getDirectCompetitorBattlecards,
  getMarketingContentCollectionBase,
  searchHelpArticles,
  validateKnowledgeIndexes,
} from "./knowledge";

describe("shared knowledge base", () => {
  it("keeps generated app help articles aligned with guide progress keys", () => {
    expect(APP_KNOWLEDGE_INDEX.helpArticles.map((article) => article.key)).toEqual(GUIDE_KEYS);
  });

  it("publishes only public-safe marketing entries to the public index", () => {
    expect(PUBLIC_KNOWLEDGE_INDEX.entries.length).toBeGreaterThan(50);
    expect(PUBLIC_KNOWLEDGE_INDEX.entries).toEqual(MARKETING_KNOWLEDGE_INDEX.entries);
    expect(
      PUBLIC_KNOWLEDGE_INDEX.entries.every(
        (entry) =>
          entry.visibility === "public" &&
          entry.safety === "public-safe" &&
          entry.consumers.includes("public-marketing") &&
          entry.consumers.includes("ai-sdr"),
      ),
    ).toBe(true);
  });

  it("validates safety boundaries and deterministic ordering", () => {
    expect(validateKnowledgeIndexes()).toEqual([]);
    expect(APP_KNOWLEDGE_INDEX.helpArticles.map((article) => article.key)).toEqual(GUIDE_KEYS);
    expect(PUBLIC_KNOWLEDGE_INDEX.entries.map((entry) => entry.id)).toEqual(
      [...PUBLIC_KNOWLEDGE_INDEX.entries.map((entry) => entry.id)].sort(),
    );
  });

  it("uses shared app role groups for route knowledge", () => {
    expect(APP_KNOWLEDGE_INDEX.routes.find((route) => route.path === "/help")?.roles).toBe(
      READ_ONLY_ROLES,
    );
    expect(APP_KNOWLEDGE_INDEX.routes.find((route) => route.path === "/donors")?.roles).toBe(
      STANDARD_ROLES,
    );
    expect(APP_KNOWLEDGE_INDEX.routes.find((route) => route.path === "/import")?.roles).toBe(
      EDITOR_UP_ROLES,
    );
    expect(APP_KNOWLEDGE_INDEX.routes.find((route) => route.path === "/settings")?.roles).toBe(
      ADMIN_ONLY_ROLES,
    );
  });

  it("builds authenticated customer support AI knowledge only from the internal knowledge export", () => {
    const json = buildPublicKnowledgeJson("customer_support_ai");
    const parsed = JSON.parse(json) as {
      consumer: string;
      marketing?: unknown;
      app?: unknown;
    };

    expect(parsed.consumer).toBe("customer_support_ai");
    expect(parsed.marketing).toBeDefined();
    expect(parsed.app).toBeDefined();
    expect(json).toContain("helpArticles");
    expect(json).not.toContain("competitorBattlecards");
  });

  it("builds marketing AI SDR knowledge from the internal knowledge export", () => {
    const json = buildPublicKnowledgeJson("marketing_ai_sdr");
    const parsed = JSON.parse(json) as {
      consumer: string;
      marketing?: unknown;
      app?: unknown;
    };

    expect(parsed.consumer).toBe("marketing_ai_sdr");
    expect(parsed.marketing).toBeDefined();
    expect(parsed.app).toBeUndefined();
    expect(json).toContain("competitorBattlecards");
  });

  it("surfaces validation issues for unsafe or misaligned knowledge entries", () => {
    const article = APP_KNOWLEDGE_INDEX.helpArticles[0]!;
    const publicEntry = PUBLIC_KNOWLEDGE_INDEX.entries[0]!;
    const originalKey = article.key;
    const originalArticleVisibility = article.visibility;
    const originalPublicVisibility = publicEntry.visibility;

    try {
      article.key = "not-a-guide-key" as typeof article.key;
      expect(validateKnowledgeIndexes()).toContain(
        "App help article keys do not match GUIDE_KEYS.",
      );

      article.key = originalKey;
      publicEntry.visibility = "authenticated";
      expect(validateKnowledgeIndexes()).toContain(
        `Public entry ${publicEntry.id} is not public-safe.`,
      );

      publicEntry.visibility = originalPublicVisibility;
      article.visibility = "public" as typeof article.visibility;
      expect(validateKnowledgeIndexes()).toContain(
        `App help article ${article.key} is not authenticated-user-safe.`,
      );
    } finally {
      article.key = originalKey;
      article.visibility = originalArticleVisibility;
      publicEntry.visibility = originalPublicVisibility;
    }
  });

  it("points accounting report guides at their real in-app routes", () => {
    const byKey = (key: string) =>
      APP_KNOWLEDGE_INDEX.helpArticles.find((article) => article.key === key);

    expect(byKey("statement_of_activities_report")?.cta.to).toBe("/accounting/reports/activities");
    expect(byKey("functional_expenses_report")?.cta.to).toBe(
      "/accounting/reports/functional-expenses",
    );
    // The generic "generate a report" hub still points at the reports landing.
    expect(byKey("generate_report")?.cta.to).toBe("/reports");
  });

  it("searches and gates authenticated app help articles", () => {
    const adminArticle = APP_KNOWLEDGE_INDEX.helpArticles.find((article) => article.cta.roles);
    expect(adminArticle).toBeDefined();
    expect(canUseHelpArticle(adminArticle!, "admin")).toBe(true);
    expect(canUseHelpArticle(adminArticle!, "viewer")).toBe(false);
    expect(canUseHelpArticle(adminArticle!, null)).toBe(false);
    expect(
      canUseHelpArticle(
        {
          ...adminArticle!,
          cta: { ...adminArticle!.cta, roles: undefined },
        },
        "viewer",
      ),
    ).toBe(true);

    expect(searchHelpArticles("", "All").length).toBe(APP_KNOWLEDGE_INDEX.helpArticles.length);
    expect(
      searchHelpArticles("billing", "Admin").every((article) => article.category === "Admin"),
    ).toBe(true);
    expect(searchHelpArticles("definitely-not-a-real-help-query", "All")).toEqual([]);

    const searchableArticle = APP_KNOWLEDGE_INDEX.helpArticles[0]!;
    const mutableArticle = searchableArticle as typeof searchableArticle & {
      aliases?: typeof searchableArticle.aliases;
    };
    const originalAliases = mutableArticle.aliases;

    try {
      mutableArticle.aliases = undefined;
      expect(searchHelpArticles(searchableArticle.title, "All")).toContain(searchableArticle);
    } finally {
      mutableArticle.aliases = originalAliases;
    }
  });

  it("resolves marketing content roots and competitor profiles", () => {
    expect(getMarketingContentCollectionBase("guides")).toBe(
      "../../packages/shared/src/knowledge/marketing/content/guides",
    );
    expect(getCompetitorProfile("bloomerang")?.name).toBe("Bloomerang");
    expect(getCompetitorProfile("missing")).toBeUndefined();
  });

  it("fails fast when direct competitor battlecards reference missing profiles", () => {
    const profile = competitorProfiles.bloomerang;
    const mutableProfiles = competitorProfiles as Record<string, typeof profile>;

    try {
      delete mutableProfiles.bloomerang;
      expect(() => getDirectCompetitorBattlecards()).toThrow(
        "Missing direct competitor profile: bloomerang",
      );
    } finally {
      mutableProfiles.bloomerang = profile;
    }
  });
});
