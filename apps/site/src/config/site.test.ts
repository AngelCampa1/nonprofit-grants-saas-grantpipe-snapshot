import { describe, expect, it } from "vitest";
import {
  ACTIVE_LEAD_MAGNET_SLUGS,
  FEATURED_LEAD_MAGNET_SLUGS,
  LEAD_MAGNET_FALLBACK_BY_FAMILY,
  NON_PDF_LEAD_MAGNET_SLUGS,
  PROMOTED_PDF_LEAD_MAGNET_SLUGS,
} from "../../../../packages/shared/src/constants/lead-magnets";
import { buildFooterEmailCaptureProps } from "@grantpipe/ui/site/lib/footer-utils";
import { resolveExitPopupProps } from "@grantpipe/ui/site/lib/exit-popup-props";
import { buildPublicSignupFlowConfig } from "@grantpipe/ui/site/lib/public-signup-flow";
import { isActiveSiteNavItem } from "@grantpipe/ui/site/lib/site-nav-active";
import type { PricingPlan } from "../../../../packages/shared/src/pricing";
import { PLAN_ENTITLEMENTS } from "../../../../packages/shared/src/constants";
import {
  siteConfig,
  getSignupCtaTarget,
  mapPricingPlanToTierConfig,
  shouldShowMobileStickyCta,
} from "./site";
import { personas } from "./personas";

describe("GrantPipe site config CRO", () => {
  it("keeps broad trial CTAs on plan choice before product signup", () => {
    expect(siteConfig.funnel.bofu.ctaText).toBe("Start your 1-month free trial");
    expect(siteConfig.funnel.bofu.ctaTarget).toBe("/pricing/#plans");
    expect(getSignupCtaTarget()).toBe("/pricing/#plans");
    expect(getSignupCtaTarget({ plan: "growth" })).toBe(
      "https://app.grantpipe.com/app/signup?plan=growth",
    );
    expect(getSignupCtaTarget({ plan: "starter", cycle: "annual" })).toBe(
      "https://app.grantpipe.com/app/signup?plan=starter&cycle=annual",
    );
    expect(siteConfig.funnel.ctaSubtitle).toBe(
      "Start a 1-month free trial with no credit card required and see compliance deadlines, restricted funds, donor records, Grants.gov search, non-federal opportunity tracking, and reporting in one workspace.",
    );
    expect(siteConfig.copy?.faq?.bottomCtaText).toBe("Start your 1-month free trial");
  });

  it("provides resource-first popup and footer signup copy", () => {
    expect(siteConfig.footer?.emailCapture).toEqual({
      heading: "Start your GrantPipe free trial",
      buttonText: "Start your 1-month free trial",
    });

    expect(siteConfig.copy?.exitPopup?.ctaText).toBe("Email Me the Free Resource");
    expect(siteConfig.copy?.exitPopup?.headline).toContain("free GrantPipe resource");
    expect(siteConfig.copy?.exitPopup?.showLeadMagnetContent).toBe(true);

    const footerCapture = buildFooterEmailCaptureProps(siteConfig, "https://grantpipe.com");
    expect(footerCapture?.mode).toBe("cta");
    if (!footerCapture || footerCapture.mode !== "cta") {
      throw new Error("Expected CTA footer props");
    }
    expect(footerCapture.ctaText).toBe("Start your 1-month free trial");
    expect(footerCapture.ctaTarget).toBe("/pricing/#plans");

    const popupProps = resolveExitPopupProps(siteConfig);
    expect(popupProps.ctaText).toBe("Email Me the Free Resource");
    expect(popupProps.description.toLowerCase()).toContain("pdf");
    expect(siteConfig.copy?.funnelCta?.trustNote).toBe(
      "No credit card required. Add billing later if the trial is a fit.",
    );
  });

  it("keeps the promoted PDF slug registry aligned with site routing config", () => {
    expect(siteConfig.leadMagnets.featuredSlugs).toEqual([...FEATURED_LEAD_MAGNET_SLUGS]);
    expect(siteConfig.leadMagnets.fallbackByFamily).toEqual({
      ...LEAD_MAGNET_FALLBACK_BY_FAMILY,
    });
    expect(PROMOTED_PDF_LEAD_MAGNET_SLUGS).toEqual(
      ACTIVE_LEAD_MAGNET_SLUGS.filter(
        (slug) => !(NON_PDF_LEAD_MAGNET_SLUGS as readonly string[]).includes(slug),
      ),
    );
  });

  it("supplies dedicated homepage hero copy", () => {
    expect(siteConfig.heroCopy?.subheadline).toBe(
      "GrantPipe connects awards, deadlines, restricted funds, donor records, documents, and reports so your team can prove what is awarded, restricted, due, and ready for review without rebuilding the story across spreadsheets.",
    );
    expect(siteConfig.heroTrustSignal).toBe(
      "Eight connected modules for the grant-funded operating week",
    );
  });

  it("uses a branded GrantPipe contact email", () => {
    expect(siteConfig.contactEmail).toBe("angel.campa@grantpipe.com");
  });

  it("does not publish a retired limited-offer banner", () => {
    expect(siteConfig.promoBanner).toBeUndefined();
  });

  it("uses Angel Campa and LinkedIn URLs as canonical founder metadata", () => {
    expect(siteConfig.author).toMatchObject({
      name: "Angel Campa",
      jobTitle: "Founder & Principal SDET",
      url: "https://grantpipe.com/about/",
      sameAs: ["https://www.linkedin.com/in/angelcampa1/"],
    });
    expect(siteConfig.sameAs).toEqual(["https://www.linkedin.com/company/grantpipe/"]);

    const companyLinks =
      siteConfig.footer?.linkGroups
        ?.find((group) => group.heading === "Company")
        ?.links.map((link) => ({ label: link.label, href: link.href })) ?? [];

    expect(companyLinks).toContainEqual({
      label: "GrantPipe LinkedIn",
      href: "https://www.linkedin.com/company/grantpipe/",
    });
    expect(companyLinks).toContainEqual({
      label: "Angel Campa LinkedIn",
      href: "https://www.linkedin.com/in/angelcampa1/",
    });
  });

  it("switches the marketing typography to the editorial pair", () => {
    expect(siteConfig.theme.fonts.heading).toBe("Spectral");
    expect(siteConfig.theme.fonts.body).toBe("Manrope");
    expect(siteConfig.theme.fonts.mono).toBe("JetBrains Mono");
  });

  it("keeps navigation focused on funnel-aware buying paths", () => {
    const navItems = siteConfig.nav?.items ?? [];

    expect(navItems.map(({ label, href }) => ({ label, href }))).toEqual([
      { label: "Product", href: "/product" },
      { label: "Solutions", href: "/solutions" },
      { label: "Resources", href: "/resources" },
      { label: "Compare", href: "/compare" },
      { label: "Pricing", href: "/pricing" },
    ]);

    const productItem = navItems.find((item) => item.label === "Product");
    expect(productItem?.activePaths).toEqual([
      "/product",
      "/features",
      "/integrations",
      "/grant-management-software",
      "/grant-compliance-software",
      "/restricted-fund-tracking-software",
    ]);
    expect(productItem?.groups?.map((group) => group.heading)).toEqual([
      "See the product",
      "Core work",
      "Proof paths",
    ]);
    expect(
      productItem?.groups?.flatMap((group) =>
        group.links.map((link) => ({ label: link.label, href: link.href })),
      ),
    ).toEqual([
      { label: "Product overview", href: "/product" },
      { label: "Features", href: "/features" },
      { label: "Integrations", href: "/integrations" },
      { label: "Grant management", href: "/grant-management-software" },
      { label: "Grant compliance", href: "/grant-compliance-software" },
      { label: "Restricted funds", href: "/restricted-fund-tracking-software" },
      { label: "Work steps", href: "/workflows" },
      { label: "Glossary", href: "/glossary" },
      { label: "FAQ hubs", href: "/resources/faq" },
    ]);

    const solutionsItem = navItems.find((item) => item.label === "Solutions");
    expect(solutionsItem?.activePaths).toEqual(["/solutions", "/for", "/nonprofit-software"]);
    expect(solutionsItem?.groups?.map((group) => group.heading)).toEqual([
      "By team",
      "By organization",
      "By location",
    ]);
    expect(solutionsItem?.groups?.flatMap((group) => group.links.map((link) => link.href))).toEqual(
      [
        "/for",
        ...personas.map((persona) => `/for/${persona.slug}`),
        "/solutions",
        "/workflows",
        "/nonprofit-software",
        "/resources/benchmarks",
      ],
    );

    const resourcesItem = navItems.find((item) => item.label === "Resources");
    expect(resourcesItem?.activePaths).toEqual(["/resources", "/free", "/glossary", "/workflows"]);
    const resourcesLinks =
      resourcesItem?.groups?.flatMap((group) => group.links.map((link) => link.href)) ?? [];

    expect(resourcesItem?.groups?.map((group) => group.heading)).toEqual([
      "Discover",
      "Compare",
      "By Audience",
      "Reference",
    ]);
    expect(new Set(resourcesLinks)).toEqual(
      new Set([
        "/resources/topics",
        "/resources/guides",
        "/compare",
        "/free",
        "/nonprofit-software",
        "/solutions",
        "/for",
        "/workflows",
        "/integrations",
        "/resources/reference",
        "/resources/faq",
        "/resources/benchmarks",
      ]),
    );

    for (const persona of personas) {
      expect(resourcesLinks).not.toContain(`/for/${persona.slug}`);
    }

    const compareItem = navItems.find((item) => item.label === "Compare");
    expect(compareItem?.activePaths).toEqual(["/compare"]);
    expect(compareItem?.groups?.map((group) => group.heading)).toEqual([
      "Compare paths",
      "Decision help",
      "Final check",
    ]);
    expect(
      compareItem?.groups?.flatMap((group) =>
        group.links.map((link) => ({ label: link.label, href: link.href })),
      ),
    ).toEqual([
      { label: "Compare overview", href: "/compare" },
      { label: "Other options", href: "/compare/alternatives" },
      { label: "Head-to-head", href: "/compare/versus" },
      { label: "Price checks", href: "/compare/pricing" },
      { label: "Tool shortlists", href: "/resources/best" },
      { label: "Pricing", href: "/pricing" },
      { label: "Free resources", href: "/free" },
    ]);

    for (const item of navItems.filter((item) => item.label !== "Pricing")) {
      expect(item.groups?.length).toBeGreaterThan(0);
      for (const group of item.groups ?? []) {
        const hrefs = group.links.map((link) => link.href);
        expect(new Set(hrefs).size).toBe(hrefs.length);
      }
    }

    const headerHrefs = new Set(
      navItems.flatMap((item) => [
        item.href,
        ...(item.groups?.flatMap((group) => group.links.map((link) => link.href)) ?? []),
      ]),
    );
    expect([...headerHrefs]).toEqual(
      expect.arrayContaining([
        "/resources",
        "/resources/guides",
        "/free",
        "/solutions",
        "/for",
        "/compare",
        "/pricing",
      ]),
    );

    const footerHrefs =
      siteConfig.footer?.linkGroups?.flatMap((group) => group.links.map((link) => link.href)) ?? [];
    expect(footerHrefs).toEqual(
      expect.arrayContaining([
        "/product",
        "/solutions",
        "/resources",
        "/compare",
        "/pricing",
        "/pricing/#plans",
      ]),
    );

    const activePathExpectations = [
      ["/workflows/prepare-sefa-for-single-audit", "Resources"],
      ["/for/executive-directors", "Solutions"],
      ["/nonprofit-software/california", "Solutions"],
      ["/resources/benchmarks/memphis-nonprofit-sector-benchmarks-2026", "Resources"],
      ["/free/grant-compliance-checklist", "Resources"],
      ["/integrations/salesforce", "Product"],
      ["/compare/pricing/wild-apricot", "Compare"],
    ] as const;

    for (const [path, expectedLabel] of activePathExpectations) {
      const activeLabels = navItems
        .filter((item) => isActiveSiteNavItem(path, item, navItems))
        .map((item) => item.label);
      expect(activeLabels).toEqual([expectedLabel]);
    }

    const mobileGroupLinks = navItems.flatMap((item) =>
      (item.groups ?? []).flatMap((group) => {
        const priorityLinks = group.links.filter((link) => link.mobilePriority);
        return priorityLinks.length > 0 ? priorityLinks : group.links;
      }),
    );
    expect(mobileGroupLinks.map((link) => link.href)).toEqual(
      expect.arrayContaining([
        "/product",
        "/features",
        "/grant-management-software",
        "/for",
        "/solutions",
        "/nonprofit-software",
        "/compare",
        "/compare/alternatives",
        "/compare/pricing",
      ]),
    );
    expect(mobileGroupLinks.length).toBeLessThanOrEqual(38);

    expect(siteConfig.footer?.linkGroups?.[0]?.links).toEqual([
      { label: "Product overview", href: "/product" },
      { label: "Compliance calendar", href: "/product/#compliance" },
      { label: "Fund and accounting visibility", href: "/product/#accounting" },
      { label: "Pricing", href: "/pricing" },
      { label: "Start your 1-month free trial", href: "/pricing/#plans" },
    ]);
  });

  it("shows the sticky mobile CTA only on intended marketing paths", () => {
    expect(shouldShowMobileStickyCta("/pricing/")).toBe(true);
    expect(shouldShowMobileStickyCta("/resources/guides/grant-compliance")).toBe(true);
    expect(shouldShowMobileStickyCta("/privacy")).toBe(false);
    expect(shouldShowMobileStickyCta("terms")).toBe(false);
    expect(shouldShowMobileStickyCta("/terms")).toBe(false);
    expect(shouldShowMobileStickyCta("/unknown")).toBe(false);
  });

  describe("pricingTiers structure", () => {
    it("has correct tier names and order", () => {
      expect(siteConfig.pricingTiers).toBeDefined();
      if (!siteConfig.pricingTiers) throw new Error("pricingTiers should be defined");
      const tierNames = siteConfig.pricingTiers.map((tier) => tier.name);
      expect(tierNames).toEqual(["Starter", "Growth", "Audit-Ready"]);
    });

    it("has correct monthly pricing in cents", () => {
      expect(siteConfig.pricingTiers).toBeDefined();
      if (!siteConfig.pricingTiers) throw new Error("pricingTiers should be defined");
      const prices = siteConfig.pricingTiers.map((tier) => tier.monthlyPriceCents);
      expect(prices).toEqual([4900, 9900, 19900]);
    });

    it("states the annual billing savings without promo language", () => {
      expect(siteConfig.pricingConfig?.annualSavingsText).toBe("Annual saves 20%.");
      expect(siteConfig.pricingConfig?.annualSavingsText).not.toMatch(/promo|first year/i);
    });

    it("keeps limited-offer display metadata out of static pricing tier config", () => {
      expect(siteConfig.pricingTiers).toBeDefined();
      if (!siteConfig.pricingTiers) throw new Error("pricingTiers should be defined");

      for (const tier of siteConfig.pricingTiers) {
        expect(tier).not.toHaveProperty("monthlyPromoPrice");
        expect(tier).not.toHaveProperty("annualPromoPrice");
        expect(tier).not.toHaveProperty("promoBadge");
      }
    });

    it("keeps pricing tiers self-serve without static promo fields", () => {
      for (const tier of siteConfig.pricingTiers ?? []) {
        expect(tier.price).not.toBe("Contact founder");
        expect(tier).not.toHaveProperty("promoBadge");
      }
    });
  });

  describe("mapPricingPlanToTierConfig", () => {
    const basePlan: PricingPlan = {
      tier: "enterprise",
      name: "Enterprise",
      description: "Custom path",
      bestFit: "Large orgs",
      pricingPageGuide: "",
      chooseThisIf: "",
      prices: null,
      highlighted: false,
      selfServe: false,
      ctaLabel: "Contact founder",
      ctaKind: "contact",
      features: ["Everything in Audit-Ready"],
      entitlements: PLAN_ENTITLEMENTS.enterprise,
    };

    it("returns Contact founder price when plan.prices is null", () => {
      const result = mapPricingPlanToTierConfig(basePlan);
      expect(result.price).toBe("Contact founder");
      expect(result).not.toHaveProperty("monthlyPriceCents");
      expect(result).not.toHaveProperty("annualPriceCents");
      expect(result).not.toHaveProperty("annualPriceOverride");
    });

    it("omits promo fields when getLaunchPromoDisplayPrice returns null", () => {
      // enterprise tier has no launch promo configured
      const result = mapPricingPlanToTierConfig(basePlan);
      expect(result).not.toHaveProperty("monthlyPromoPrice");
      expect(result).not.toHaveProperty("annualPromoPrice");
      expect(result).not.toHaveProperty("promoBadge");
    });

    it("includes price cents without static promo fields when plan has prices", () => {
      const result = mapPricingPlanToTierConfig({
        ...basePlan,
        tier: "starter",
        prices: { monthlyCents: 4900, annualCents: 46800, annualMonthlyEquivalentCents: 3900 },
        selfServe: true,
        ctaKind: "checkout",
      });
      expect(result.monthlyPriceCents).toBe(4900);
      expect(result.annualPriceCents).toBe(46800);
      expect(result.annualPriceOverride).toBeDefined();
      expect(result).not.toHaveProperty("monthlyPromoPrice");
      expect(result).not.toHaveProperty("annualPromoPrice");
      expect(result).not.toHaveProperty("promoBadge");
    });
  });

  describe("pricingTiers structure (continued)", () => {
    it("highlights only the Growth tier", () => {
      expect(siteConfig.pricingTiers).toBeDefined();
      if (!siteConfig.pricingTiers) throw new Error("pricingTiers should be defined");
      const highlightedTier = siteConfig.pricingTiers.find((tier) => tier.highlighted);
      expect(highlightedTier?.name).toBe("Growth");
      expect(siteConfig.pricingTiers[1]!.highlighted).toBe(true);
      expect(siteConfig.pricingTiers[0]!.highlighted).toBe(false);
      expect(siteConfig.pricingTiers[2]!.highlighted).toBe(false);
    });

    it("publishes generous active grant caps and plan-specific language", () => {
      expect(siteConfig.pricingTiers?.[0]?.features.join(" ")).toContain("Up to 10 active grants");
      expect(siteConfig.pricingTiers?.[0]?.bestFit).toBe("Stop missing deadlines");
      expect(siteConfig.pricingTiers?.[0]?.description).toContain("spreadsheets");
      expect(siteConfig.pricingTiers?.[0]?.description).toContain("Reminders");
      expect(siteConfig.pricingTiers?.[1]?.features[0]).toBe("Everything in Starter");
      expect(siteConfig.pricingTiers?.[1]?.features.join(" ")).toContain("Up to 50 active grants");
      expect(siteConfig.pricingTiers?.[1]?.features.join(" ")).not.toContain("4x Starter");
      expect(siteConfig.pricingTiers?.[1]?.features.join(" ")).not.toContain("5x Growth");
      expect(siteConfig.pricingTiers?.[1]?.bestFit).toBe("Run more grants with less stress");
      expect(siteConfig.pricingTiers?.[1]?.description).not.toContain("QuickBooks");
      expect(siteConfig.pricingTiers?.[1]?.features.join(" ")).not.toMatch(/QuickBooks|QBO/i);
      expect(siteConfig.pricingTiers?.[1]?.features).toContain("Spend-down threshold email alerts");
      expect(siteConfig.pricingTiers?.[1]?.features).toContain("Compliance report pack");
      expect(siteConfig.pricingTiers?.[1]?.features).toContain("Program budget-vs-actual exports");
      expect(siteConfig.pricingTiers?.[1]?.features).toContain("Outcome and impact tracking");
      expect(siteConfig.pricingTiers?.[1]?.features).not.toContain("Recurring gift engine");
      expect(siteConfig.pricingTiers?.[1]?.features).not.toContain("Advanced reporting");
      expect(siteConfig.pricingTiers?.[1]?.features).not.toContain("Multi-fund tracking");
      expect(siteConfig.pricingTiers?.[2]?.features[0]).toBe("Everything in Growth");
      expect(siteConfig.pricingTiers?.[2]?.features).toContain(
        "Restriction evidence package output",
      );
      expect(siteConfig.pricingTiers?.[2]?.features).toContain(
        "Budget amendment history and audit views",
      );
      expect(siteConfig.pricingTiers?.[2]?.features).toContain(
        "Financial statements and board-ready outputs",
      );
      expect(siteConfig.pricingTiers?.[2]?.features.join(" ")).toContain("Up to 100 active grants");
      expect(siteConfig.pricingTiers?.[2]?.bestFit).toBe("Prove every dollar");
      const auditReadyDescription = siteConfig.pricingTiers?.[2]?.description ?? "";
      expect(auditReadyDescription.toLowerCase()).toContain("audit");
      expect(auditReadyDescription.toLowerCase()).toContain("evidence");
      expect(siteConfig.pricingTiers?.[2]?.features).toContain(
        "Guided onboarding, import, and setup",
      );
      expect(siteConfig.pricingTiers?.[2]?.features).not.toContain("External auditor portal");
    });
  });

  describe("pricing FAQ alignment", () => {
    it("explains Starter, Growth, and Audit-Ready using the public grant caps and plan split", () => {
      const pricingFaq = siteConfig.faqs.find((faq) => faq.q === "How much does GrantPipe cost?");

      expect(siteConfig.product.price).toContain("$49-$199/mo");
      expect(siteConfig.product.price).toContain("Federal Edition");
      expect(siteConfig.product.price).not.toContain("first year");
      expect(siteConfig.product.price).not.toContain("80% off");
      expect(pricingFaq?.a).toContain("Starter starts at $49/mo");
      expect(pricingFaq?.a).toContain("Growth starts at $99/mo");
      expect(pricingFaq?.a).toContain("Audit-Ready starts at $199/mo");
      expect(pricingFaq?.a).toContain("Federal Edition is a contact path");
      expect(pricingFaq?.a).not.toContain("limited offer");
      expect(pricingFaq?.a).not.toContain("first year");
      expect(pricingFaq?.a).not.toContain("4x Starter");
      expect(pricingFaq?.a).not.toContain("5x Growth");
      expect(pricingFaq?.a).toContain("contact founder Angel Campa");
      expect(pricingFaq?.a).toContain("angel.campa@grantpipe.com");
      expect(pricingFaq?.a).not.toContain("Advanced reporting");
      expect(pricingFaq?.a).not.toContain("multi-fund tracking");
      expect(pricingFaq?.a).not.toContain("QuickBooks sync");
      expect(pricingFaq?.a).not.toContain("External auditor portal");
    });
  });

  it("positions GrantPipe as a compliance-first grant management system", () => {
    expect(siteConfig.metaDescription).toContain("compliance-first grant management system");
    expect(siteConfig.metaDescription).toContain(
      "awards, deadlines, restricted funds, evidence, reports, donor context, and audit trails",
    );
    expect(siteConfig.tagline).toBe("Compliance-first grant management system.");
    expect(siteConfig.product.category).toContain("Compliance-first grant management system");
    expect(JSON.stringify(siteConfig)).not.toMatch(/compliance-heavy nonprofits/i);
    expect(JSON.stringify(siteConfig)).not.toMatch(/Compliance-first operating system/i);
    expect(siteConfig.copy?.homepage?.proofBody).toContain("eight connected modules");
    expect(siteConfig.copy?.homepage?.proofBody).toContain("what each plan includes");
  });

  it("keeps Cal.com off the public site config", () => {
    const serializedConfig = JSON.stringify(siteConfig);

    expect(serializedConfig).not.toMatch(/cal\.com/i);
    expect(siteConfig.discoveryCallUrl).toBe("mailto:angel.campa@grantpipe.com");
    expect(
      siteConfig.footer?.linkGroups
        ?.flatMap((group) => group.links)
        .some(
          (link) =>
            /^(discovery call|book a .+|schedule .+)/i.test(link.label) ||
            /cal\.com/i.test(link.href),
        ),
    ).toBe(false);
  });

  it("keeps the public signup flow on trial CTAs instead of calendar booking", () => {
    const signupFlow = buildPublicSignupFlowConfig(siteConfig);

    expect(JSON.stringify(signupFlow)).not.toMatch(/cal\.com/i);
    expect(signupFlow.discoveryCallUrl).toBe("mailto:angel.campa@grantpipe.com");
    expect(signupFlow.qualifiedCtaTarget).toBe("/pricing/#plans");
    expect(signupFlow.qualifiedCtaText).toBe("Start your 1-month free trial");
  });

  it("avoids the old inflated shared copy phrases", () => {
    expect(siteConfig.product.trustSignals.map((signal) => signal.text)).not.toContain(
      ["No", "consultants required"].join(" "),
    );
    expect(siteConfig.product.trustSignals.map((signal) => signal.text)).not.toContain(
      "compliance reports in one click",
    );
    expect(siteConfig.copy?.homepage?.proofBody?.toLowerCase()).not.toContain("all-in-one");
    expect(siteConfig.copy?.survey?.qualifiedBody).not.toContain("We'd love");
    expect(siteConfig.copy?.survey?.qualifiedBody).toBe(
      "We built GrantPipe for teams that manage grants and donors. Start a free trial. See if it fits your work.",
    );
    expect(siteConfig.copy?.exitPopup?.declineText).not.toContain("piecing it together manually");
  });

  it("frames fund accounting as a live included feature", () => {
    const restrictedFundsFaq = siteConfig.faqs.find(
      (faq) => faq.q === "Does GrantPipe handle restricted fund tracking?",
    );

    expect(restrictedFundsFaq?.a).toContain("GrantPipe includes native accounting records");
    expect(restrictedFundsFaq?.a).toContain("It does not sync with QuickBooks right now");
    expect(restrictedFundsFaq?.a).toContain("FASB ASC 958");
    expect(restrictedFundsFaq?.a).toContain("double-entry");
    expect(restrictedFundsFaq?.a).not.toContain("coming soon");
    expect(restrictedFundsFaq?.a).not.toMatch(/QuickBooks Online read-only accounting/i);
    expect(restrictedFundsFaq?.a).not.toMatch(/Audit-Ready adds[^.]*QuickBooks/);
  });

  it("answers the AI capability and plan-availability question accurately", () => {
    const aiFaq = siteConfig.faqs.find((faq) => faq.q === "Does GrantPipe include AI?");

    expect(aiFaq).toBeDefined();
    expect(aiFaq?.a).toContain("Every paid plan includes AI Award Document Intake");
    expect(aiFaq?.a).toContain("AI Award Document Intake");
    expect(aiFaq?.a).toContain("Ask-Your-Ledger");
    expect(aiFaq?.a).toContain("You check the source before any record is created");
    expect(aiFaq?.a).toContain("Starter includes up to 5 award intakes each month");
    expect(aiFaq?.a).toContain("Growth plans and up");
    expect(aiFaq?.a).not.toContain("20 ledger questions");
  });
});
