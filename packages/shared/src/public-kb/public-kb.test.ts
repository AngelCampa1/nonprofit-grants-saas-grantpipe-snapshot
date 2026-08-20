import { describe, expect, it } from "vitest";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { CAPABILITY_CLAIMS } from "../capabilities";
import { GUIDE_KEYS } from "../validators/help";
import {
  FEDERAL_EDITION_SKU,
  FOUNDER_CONTACT_EMAIL,
  GRANTPIPE_TRIAL_COPY,
  PLAN_CATALOG,
} from "../pricing";
import {
  buildPublicKnowledgeJson,
  competitorProfiles,
  directCompetitorSlugs,
  getCompetitorProfile,
  getDirectCompetitorBattlecards,
  getMarketingContentRepositoryRoot,
  getPublicKnowledgeJsonArtifacts,
  grantPipeMarketPosition,
  marketingKnowledge,
} from "./index";

describe("public knowledge base", () => {
  it("derives pricing and trial facts from the shared pricing catalog", () => {
    expect(marketingKnowledge.trial.copy).toBe(GRANTPIPE_TRIAL_COPY);
    expect(marketingKnowledge.trial.noCreditCardRequired).toBe(true);
    expect(marketingKnowledge.plans.map((plan) => plan.tier)).toEqual(
      PLAN_CATALOG.map((plan) => plan.tier),
    );
    expect(marketingKnowledge.plans[0]).toMatchObject({
      name: PLAN_CATALOG[0]!.name,
      description: PLAN_CATALOG[0]!.description,
      features: PLAN_CATALOG[0]!.features,
    });
    expect(marketingKnowledge.plans[0]).not.toHaveProperty("entitlements");
  });

  it("centralizes public marketing CTAs, positioning, and objections", () => {
    expect(marketingKnowledge.brand).toMatchObject({
      name: "GrantPipe",
      domain: "grantpipe.com",
      siteUrl: "https://grantpipe.com",
      appUrl: "https://app.grantpipe.com",
      signupPath: "/app/signup",
      signupUrl: "https://app.grantpipe.com/app/signup",
      emailLogoUrl: "https://grantpipe.com/logo-email.png",
    });
    expect(marketingKnowledge.contact).toMatchObject({
      publicEmail: "angel.campa@grantpipe.com",
      supportEmail: "angel.campa@grantpipe.com",
      founderEmail: FOUNDER_CONTACT_EMAIL,
      transactionalSender: "GrantPipe <angel.campa@grantpipe.com>",
      feedbackSender: "GrantPipe Feedback <angel.campa@grantpipe.com>",
    });
    expect(marketingKnowledge.emails.signature).toBe("Angel Campa\nFounder, GrantPipe");
    expect(marketingKnowledge.emails.leadFooterCopy).toBe(
      "You're receiving this because you downloaded a resource from grantpipe.com.",
    );
    expect(marketingKnowledge.productPositioning.category).toContain(
      "Compliance-first grant management system",
    );
    expect(marketingKnowledge.productPositioning.tagline).toContain(
      "Compliance-first grant management system",
    );
    expect(marketingKnowledge.productPositioning.boilerplate).toContain(
      "awards, deadlines, restricted funds",
    );
    expect(marketingKnowledge.productPositioning.boilerplate).toContain(
      "evidence, reports, donor context, and audit trails",
    );
    expect(marketingKnowledge.ctas.trial).toMatchObject({
      label: "Start your 1-month free trial",
      href: "https://app.grantpipe.com/app/signup",
      message: "Start your 1-month free trial to see pricing details and next steps.",
    });
    expect(marketingKnowledge.ctas.trial.subtitle).toContain("no credit card required");
    expect(marketingKnowledge.ctas.headerMobileEyebrow).toBe("Start free trial");
    expect(marketingKnowledge.objections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "replace-crm",
          answer: expect.stringContaining("grant compliance"),
        }),
      ]),
    );
  });

  it("exposes the marketing content repository root for build-time generators", () => {
    expect(getMarketingContentRepositoryRoot()).toBe(
      "packages/shared/src/knowledge/marketing/content",
    );
  });

  it("keeps founder and competitor facts public-safe and source-backed", () => {
    expect(marketingKnowledge.founder.email).toBe(FOUNDER_CONTACT_EMAIL);
    expect(marketingKnowledge.competitorBattlecards.map((battlecard) => battlecard.slug)).toEqual([
      ...directCompetitorSlugs,
    ]);

    for (const battlecard of marketingKnowledge.competitorBattlecards) {
      const profile = competitorProfiles[battlecard.slug];
      expect(battlecard.pricingSummary).toBe(profile?.pricingSummary);
      expect(battlecard.contractSummary).toBe(profile?.contractSummary);
      expect(battlecard.setupSummary).toBe(profile?.setupSummary);
      expect(battlecard.donorCrmSummary).toBe(profile?.donorCrmSummary);
      expect(battlecard.grantSummary).toBe(profile?.grantSummary);
      expect(battlecard.complianceSummary).toBe(profile?.complianceSummary);
      expect(battlecard.bestFor).toBe(profile?.bestFor);
      expect(battlecard.verifiedAt).toBe(profile?.verifiedAt);
      expect(battlecard.sources.length).toBeGreaterThan(0);
      expect(battlecard.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      for (const source of battlecard.sources) {
        expect(source.url).toMatch(/^https:\/\//);
      }
    }

    const serialized = JSON.stringify(marketingKnowledge).toLowerCase();
    expect(serialized).not.toMatch(/\b(password|secret|auth token|raw token|private key)\b/);
    expect(serialized).not.toContain("board-ready reports");
  });

  it("publishes Federal Edition in GrantPipe market positioning without making it self-serve", () => {
    expect(grantPipeMarketPosition.pricingSummary).toContain(
      `${FEDERAL_EDITION_SKU.name} ${FEDERAL_EDITION_SKU.planningEstimateLabel}`,
    );
    expect(grantPipeMarketPosition.pricingSummary).toContain("custom Enterprise path");
    expect(marketingKnowledge.plans.map((plan) => plan.tier)).toEqual(
      PLAN_CATALOG.map((plan) => plan.tier),
    );
  });

  it("keeps migration support copy aligned with guided onboarding entitlements", () => {
    const migrationObjection = marketingKnowledge.objections.find(
      (objection) => objection.id === "migration",
    );
    const publicKbJson = buildPublicKnowledgeJson("marketing_ai_sdr");

    expect(migrationObjection?.answer).toContain("Starter and Growth");
    expect(migrationObjection?.answer).toContain("self-serve");
    expect(migrationObjection?.answer).toContain("Audit-Ready and Enterprise");
    expect(migrationObjection?.answer).toContain("guided onboarding, import, and setup");
    expect(migrationObjection?.answer).not.toMatch(/Starter and Growth[^.]*guided/i);
    expect(publicKbJson).toContain('"id": "migration"');
    expect(publicKbJson).toContain("Starter and Growth use self-serve CSV import tools and docs.");
    expect(publicKbJson).toContain("Audit-Ready and Enterprise add guided onboarding");
  });

  it("maps public competitor profiles into source-backed battlecards", () => {
    const battlecards = getDirectCompetitorBattlecards();

    expect(battlecards.map((battlecard) => battlecard.slug)).toEqual([...directCompetitorSlugs]);
    expect(getCompetitorProfile("bloomerang")?.name).toBe("Bloomerang");
    expect(getCompetitorProfile("missing")).toBeUndefined();
    expect(battlecards[0]).toMatchObject({
      slug: competitorProfiles[directCompetitorSlugs[0]]?.slug,
      pricing: competitorProfiles[directCompetitorSlugs[0]]?.pricingSummary,
      weakness: competitorProfiles[directCompetitorSlugs[0]]?.complianceSummary,
    });
    expect(battlecards[0]?.sources[0]).toEqual({
      label: `${battlecards[0]?.name} source 1`,
      url: competitorProfiles[directCompetitorSlugs[0]]?.sourceUrls[0],
    });
  });

  it("fails fast when a direct competitor profile is missing", () => {
    const mutableProfiles = competitorProfiles as Record<
      string,
      (typeof competitorProfiles)[keyof typeof competitorProfiles] | undefined
    >;
    const removedProfile = mutableProfiles.bloomerang;

    try {
      delete mutableProfiles.bloomerang;

      expect(() => getDirectCompetitorBattlecards()).toThrow(
        "Missing direct competitor profile: bloomerang",
      );
    } finally {
      mutableProfiles.bloomerang = removedProfile;
    }
  });

  it("keeps the public facade free of authenticated app exports", async () => {
    const publicKb = await import("./index");

    expect(Object.keys(publicKb)).not.toContain("appKnowledge");
  });

  it("does not depend on the private knowledge barrel or app help data", () => {
    const publicFacadeSource = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
    const marketingSource = readFileSync(
      new URL("../knowledge/marketing/index.ts", import.meta.url),
      "utf8",
    );

    expect(publicFacadeSource).not.toContain('../knowledge"');
    expect(publicFacadeSource).not.toContain("../knowledge';");
    expect(publicFacadeSource).not.toContain("appKnowledge");
    expect(marketingSource).not.toContain("../../public-kb");
  });

  it("keeps app help article keys stable for progress tracking", async () => {
    const { appKnowledge } = await import("../knowledge");

    expect(appKnowledge.helpArticles.map((article) => article.key)).toEqual([...GUIDE_KEYS]);
  });

  it("keeps help CTAs backed by shipped app route metadata", async () => {
    const { appKnowledge } = await import("../knowledge");
    const routes = new Set(appKnowledge.routes.map((route) => route.path));

    for (const article of appKnowledge.helpArticles) {
      expect(article.cta, article.key).not.toHaveProperty("href");
      expect(routes.has(article.cta.to), article.key).toBe(true);
      expect(article.title.length).toBeGreaterThan(0);
      expect(article.steps.length).toBeGreaterThan(0);
    }
  });

  it("builds a marketing AI SDR view without authenticated help content", () => {
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
    expect(json).not.toContain("helpArticles");
    expect(json).not.toContain("entitlements");
    expect(json).not.toContain("authenticated");
    expect(json).not.toContain("customer_support_ai");
    expect(json).not.toMatch(/cal\.com|calendly/i);
  });

  it("keeps planned and surface-disallowed capability claims out of public AI JSON", () => {
    const json = buildPublicKnowledgeJson("marketing_ai_sdr");
    const parsed = JSON.parse(json) as {
      marketing: {
        plans: Array<{ features: string[] }>;
        content: {
          entries: Array<{
            id: string;
            collection: string;
            slug: string;
            title: string;
          }>;
        };
      };
    };
    const publicAiUnsafeClaims = CAPABILITY_CLAIMS.filter(
      (claim) =>
        claim.status !== "shipped" ||
        !claim.allowedPublicSurfaces.includes("public-kb") ||
        !claim.allowedPublicSurfaces.includes("ai-sdr"),
    );
    const planFeatures = parsed.marketing.plans.flatMap((plan) => plan.features);
    const featureContentEntries = parsed.marketing.content.entries.filter(
      (entry) => entry.collection === "features",
    );

    for (const claim of publicAiUnsafeClaims) {
      expect(planFeatures, claim.key).not.toContain(claim.label);
      expect(
        featureContentEntries.some(
          (entry) =>
            entry.slug === claim.featureSlug ||
            entry.id === `features:${claim.featureSlug}` ||
            entry.title.toLowerCase().includes(claim.label.toLowerCase()),
        ),
        claim.key,
      ).toBe(false);
    }
  });

  it("rejects authenticated support JSON from the public facade", () => {
    expect(() =>
      buildPublicKnowledgeJson("customer_support_ai" as unknown as "marketing_ai_sdr"),
    ).toThrow();
  });

  it("defines generated JSON artifact names for each AI consumer", () => {
    expect(getPublicKnowledgeJsonArtifacts().map((artifact) => artifact.fileName)).toEqual([
      "marketing-ai-sdr.json",
    ]);
  });

  it("writes public JSON artifacts through the package export script", async () => {
    const outputDirUrl = new URL("../../dist/public-kb/", import.meta.url);
    const staleArtifactUrl = new URL(
      "../../dist/public-kb/customer-support-ai.json",
      import.meta.url,
    );
    mkdirSync(outputDirUrl, { recursive: true });
    writeFileSync(staleArtifactUrl, '{"consumer":"customer_support_ai"}\n', "utf8");

    await import("./export-json");

    const { readFileSync } = await import("node:fs");
    const artifact = readFileSync(
      new URL("../../dist/public-kb/marketing-ai-sdr.json", import.meta.url),
      "utf8",
    );

    expect(artifact).toContain('"consumer": "marketing_ai_sdr"');
    expect(artifact).toBe(buildPublicKnowledgeJson("marketing_ai_sdr"));
    expect(artifact).not.toContain("helpArticles");
    expect(existsSync(staleArtifactUrl)).toBe(false);
  });
});
