import type { SiteConfig } from "@grantpipe/ui/site";
import { describe, expect, it } from "vitest";

import { siteConfig } from "../config/site";
import { PRICING_TXT_LAST_UPDATED, buildPricingTxt } from "./pricing-txt";

const mockConfig: SiteConfig = {
  name: "GrantPipe",
  domain: "grantpipe.com",
  tagline: "Nonprofit CRM for Grant Compliance",
  product: {
    category: "Nonprofit Donor Management & Grant Compliance Software",
    price: "$49-$199/mo self-serve; custom Enterprise path",
    targetAudience:
      "Executive Directors and Development Directors at mid-sized nonprofits ($500K-$10M annual budgets)",
    trustSignals: [],
  },
  competitors: [
    {
      slug: "bloomerang",
      name: "Bloomerang",
      pricing: "$125-$249/mo",
      weakness: "No grant management or compliance tracking",
    },
    {
      slug: "blackbaud",
      name: "Blackbaud",
      pricing: "$5,000-$15,000+/yr",
      weakness: "Legacy interface, opaque pricing, contract lock-in",
    },
    {
      slug: "salesforce-nonprofit",
      name: "Salesforce Nonprofit",
      pricing: "$60-$165/user/mo plus implementation",
      weakness: "Can require a large setup project before launch",
    },
  ],
  funnel: {
    tofu: { ctaMode: "educate", ctaText: "Learn More", ctaTarget: "/resources" },
    mofu: {
      ctaMode: "evaluate",
      ctaText: "See How We Compare",
      ctaTarget: "/compare",
    },
    bofu: {
      ctaMode: "convert",
      ctaText: "Start Free Trial",
      ctaTarget: "/signup",
    },
    ctaSubtitle: "No credit card required. Add billing later if the trial is a fit.",
  },
  survey: { questions: [] },
  faqs: [],
  discoveryCallUrl: "mailto:angel.campa@grantpipe.com",
  discoveryCallIncentive: "Contact founder",
  problemAgitation: {
    heading: "Problem",
    closingLine: "Solution",
    painPoints: [],
  },
  leadMagnets: {
    featuredSlugs: [
      "grant-compliance-checklist",
      "nonprofit-crm-evaluation-scorecard",
      "donor-retention-playbook",
    ],
    fallbackByFamily: {
      guide: "grant-compliance-checklist",
      listicle: "nonprofit-crm-evaluation-scorecard",
      "state-page": "grant-compliance-checklist",
      solution: "grant-compliance-checklist",
      comparison: "nonprofit-crm-evaluation-scorecard",
      "pricing-breakdown": "nonprofit-crm-evaluation-scorecard",
    },
  },
  theme: {
    primary: "#065f46",
    accent: "#e07a5f",
    fonts: { heading: "Sora", body: "IBM Plex Sans" },
  },
  pricingTiers: [
    {
      name: "Starter",
      price: "$49/mo",
      monthlyPriceCents: 4900,
      annualPriceCents: 46800,
      description: "For small teams getting off spreadsheets",
      features: [
        "Donor CRM",
        "Grant pipeline tracking",
        "Compliance calendar",
        "990 export templates",
      ],
    },
    {
      name: "Growth",
      price: "$99/mo",
      monthlyPriceCents: 9900,
      annualPriceCents: 94800,
      highlighted: true,
      description: "For multi-grant nonprofits with reporting pressure",
      features: [
        "Everything in Starter",
        "Automated deadline reminder emails",
        "Spend-down threshold email alerts",
        "Compliance report pack",
      ],
    },
    {
      name: "Audit-Ready",
      price: "$199/mo",
      monthlyPriceCents: 19900,
      annualPriceCents: 190800,
      description: "For orgs with audit scrutiny or complex programs",
      features: [
        "Everything in Growth",
        "Program Allocation management and budget-vs-actual exports",
        "Advanced fund accounting",
        "Financial statements and board-ready outputs",
        "Guided onboarding",
      ],
    },
  ],
  pricingConfig: {
    trialBannerText:
      "Pick a plan to start your 1-month free trial. No credit card required to start. Add billing later if the trial is a fit.",
    annualSavingsText: "Annual saves 20%.",
    monthlyToggleLabel: "Monthly",
    annualToggleLabel: "Annual",
  },
};

describe("buildPricingTxt", () => {
  it("includes the product name in the heading", () => {
    const output = buildPricingTxt(mockConfig);
    expect(output).toContain("# GrantPipe Pricing");
  });

  it("includes the product category", () => {
    const output = buildPricingTxt(mockConfig);
    expect(output).toContain("Nonprofit Donor Management & Grant Compliance Software");
    expect(output).toContain(
      "Grant management category: Compliance-first grant management system.",
    );
    expect(output).toContain("grant management software built for compliance");
    expect(output).not.toMatch(/grant-funded nonprofits/i);
    expect(output).not.toMatch(/Compliance-first operating system/i);
  });

  it("publishes product area and plan-safe language for agents", () => {
    const output = buildPricingTxt(mockConfig);

    expect(output).toContain(
      "Product areas: Compliance calendar, Evidence trail, Restricted funds, Grant pipeline, Donor CRM, Multi-source grant pipeline, Fund accounting, and Auditor and funder portal.",
    );
    expect(output).toContain(
      "Plan access: GrantPipe spans eight connected areas of work; the pricing page shows what each plan includes.",
    );
    expect(output).not.toContain(`30-day ${"trial"}`);
  });

  it("includes the target audience", () => {
    const output = buildPricingTxt(mockConfig);
    expect(output).toContain(
      "Executive Directors and Development Directors at mid-sized nonprofits",
    );
  });

  it("includes trial information", () => {
    const output = buildPricingTxt(mockConfig);
    expect(output).toContain(
      "Pick a plan to start your 1-month free trial. No credit card required to start. Add billing later if the trial is a fit.",
    );
  });

  it("publishes the named guarantee stack", () => {
    const output = buildPricingTxt(siteConfig);

    expect(output).toContain("## Stand-Behind-It Stack");
    expect(output).toContain("Start with proof, not a long contract.");
    expect(output).toContain("- 1-month free trial:");
    expect(output).toContain("- No card to start:");
    expect(output).toContain("- No setup fee:");
    expect(output).toContain("- 30-day money-back:");
  });

  it("includes annual savings information", () => {
    const output = buildPricingTxt(mockConfig);
    expect(output).toContain(
      "Annual billing: billed annually and shown as a monthly price. Saves 20%.",
    );
    expect(output).not.toContain("Limited time offer");
    expect(output).not.toContain("May 31");
  });

  it("does not publish a launch promo expiration date", () => {
    const output = buildPricingTxt(siteConfig);

    expect(output).not.toContain("Limited time offer");
    expect(output).not.toContain(["LAUNCH", "30"].join(""));
    expect(output).not.toContain("through May 31, 2026");
  });

  it("publishes current live pricing, custom path positioning, and grant overage terms", () => {
    const output = buildPricingTxt(siteConfig);

    expect(output).toContain(
      "### Starter - $39/month billed annually ($468/year; $49/month monthly list price)",
    );
    expect(output).toContain(
      "### Growth - $79/month billed annually ($948/year; $99/month monthly list price) [Most Popular]",
    );
    expect(output).toContain(
      "### Audit-Ready - $159/month billed annually ($1,908/year; $199/month monthly list price)",
    );
    expect(output).not.toContain("### Starter - $49/month ($39/month billed annually)");
    expect(output).not.toContain("first-year price");
    expect(output).not.toContain("Regular price:");
    expect(output).not.toContain("### Enterprise - Contact founder");
    expect(output).toContain("Active grant definition:");
    expect(output).toContain("$10/active grant/month");
    expect(output).toContain("10-grant soft headroom");
    expect(output).toContain("Up to 10 active grants");
    expect(output).toContain("Up to 50 active grants");
    expect(output).not.toContain("4x Starter");
    expect(output).not.toContain("5x Growth");
    expect(output).toContain("Best for: Stop missing deadlines");
    expect(output).toContain("Best for: Run more grants with less stress");
    expect(output).toContain("Best for: Prove every dollar");
  });

  it("publishes Federal Edition as a contact SKU without an unverified dollar anchor", () => {
    const output = buildPricingTxt(siteConfig);

    expect(output).toContain("## Federal Edition");
    expect(output).toContain("Purchase path: contact founder.");
    expect(output).toContain("Custom rollout plan. We set price after a call.");
    expect(output).not.toContain("$30K-$80K");
    expect(output).toContain("- SEFA draft and single-audit tripwire");
    expect(output).toContain("- Uniform Guidance checks at expense entry");
    expect(output).not.toContain("### Federal Edition -");
  });

  it("includes all three tier names", () => {
    const output = buildPricingTxt(mockConfig);
    expect(output).toContain("Starter");
    expect(output).toContain("Growth");
    expect(output).toContain("Audit-Ready");
  });

  it("includes monthly prices for each tier", () => {
    const output = buildPricingTxt(mockConfig);
    expect(output).toContain("$49/month");
    expect(output).toContain("$99/month");
    expect(output).toContain("$199/month");
  });

  it("includes computed annual prices for each tier", () => {
    const output = buildPricingTxt(mockConfig);
    expect(output).toContain("$39/month billed annually");
    expect(output).toContain("$468/year");
    expect(output).toContain("$79/month billed annually");
    expect(output).toContain("$948/year");
    expect(output).toContain("$159/month billed annually");
    expect(output).toContain("$1,908/year");
  });

  it("rounds computed annual monthly equivalents up to whole dollars", () => {
    const output = buildPricingTxt({
      ...mockConfig,
      pricingTiers: [
        {
          name: "Lean",
          price: "$17.21/mo",
          monthlyPriceCents: 1721,
          description: "Small plan",
          features: ["Core tracking"],
        },
      ],
    });

    expect(output).toContain("$13/month billed annually");
    expect(output).not.toContain("$15/month billed annually");
  });

  it("uses explicit annual totals before falling back to computed annual pricing", () => {
    const output = buildPricingTxt({
      ...mockConfig,
      pricingTiers: [
        {
          name: "Annual Exact",
          price: "$100/mo",
          monthlyPriceCents: 10000,
          annualPriceCents: 48000,
          description: "Annual total plan",
          features: ["Core tracking"],
        },
      ],
    });

    expect(output).toContain(
      "### Annual Exact - $40/month billed annually ($480/year; $100/month monthly list price)",
    );
    expect(output).not.toContain("$84/month billed annually");
  });

  it("includes the most popular marker on the highlighted tier heading", () => {
    const output = buildPricingTxt(mockConfig);
    const growthLine = output
      .split("\n")
      .find((line) => line.includes("Growth") && line.startsWith("###"));

    expect(growthLine).toBeDefined();
    expect(growthLine).toContain("[Most Popular]");
  });

  it("includes tier descriptions", () => {
    const output = buildPricingTxt(mockConfig);
    expect(output).toContain("For small teams getting off spreadsheets");
    expect(output).toContain("For multi-grant nonprofits with reporting pressure");
    expect(output).toContain("For orgs with audit scrutiny or complex programs");
  });

  it("includes tier features", () => {
    const output = buildPricingTxt(mockConfig);
    expect(output).toContain("Donor CRM");
    expect(output).toContain("Automated deadline reminder emails");
    expect(output).toContain("Program Allocation management and budget-vs-actual exports");
    expect(output).toContain("Financial statements and board-ready outputs");
  });

  it("keeps Program Allocation management on Starter and exports on Growth in live pricing.txt", () => {
    const output = buildPricingTxt(siteConfig);

    const starterSection = output.split("### Growth")[0] ?? "";
    const growthSection = output.split("### Growth")[1]?.split("### Audit-Ready")[0] ?? "";
    const auditSection = output.split("### Audit-Ready")[1] ?? "";
    expect(starterSection).toContain("Program management and allocation tracking");
    expect(growthSection).toContain("Program budget-vs-actual exports");
    expect(auditSection).not.toContain("Program Allocation management");
  });

  it("lists universal inclusions once at the top of Plans", () => {
    const output = buildPricingTxt(mockConfig);
    expect(output).toContain("Included on every plan:");
    expect(output).toContain("- Unlimited users");
    expect(output).toContain("- Grants.gov search plus manual/imported non-federal opportunities");
    expect(output).toContain("- Manual/imported non-federal opportunity tracking");
    expect(output.match(/- Unlimited users/g)).toHaveLength(1);
  });

  it("includes a competitor comparison section", () => {
    const output = buildPricingTxt(mockConfig);
    expect(output).toContain("## Competitor Pricing Comparison");
  });

  it("includes competitor names, pricing, and weaknesses", () => {
    const output = buildPricingTxt(mockConfig);
    expect(output).toContain("Bloomerang");
    expect(output).toContain("Blackbaud");
    expect(output).toContain("Salesforce Nonprofit");
    expect(output).toContain("$125-$249/mo");
    expect(output).toContain("$5,000-$15,000+/yr");
    expect(output).toContain("No grant management or compliance tracking");
    expect(output).toContain("Legacy interface, opaque pricing, contract lock-in");
  });

  it("publishes the canonical pricing page URL", () => {
    const output = buildPricingTxt(mockConfig);
    expect(output).toContain("## Pricing URL");
    expect(output).toContain("https://grantpipe.com/pricing/");
  });

  it("publishes machine-readable freshness, canonical, and contact metadata", () => {
    const output = buildPricingTxt(mockConfig);

    expect(output).toContain(`Last updated: ${PRICING_TXT_LAST_UPDATED}`);
    expect(output).toContain("Canonical pricing URL: https://grantpipe.com/pricing/");
    expect(output).toContain("Contact: mailto:angel.campa@grantpipe.com");
  });

  it("keeps trial copy sentence-cased for AI agents", () => {
    const output = buildPricingTxt({
      ...mockConfig,
      pricingConfig: {
        ...mockConfig.pricingConfig,
        trialBannerText:
          "Pick a plan to start your 1-month free trial. no credit card required to start. add billing later if the trial is a fit.",
      },
    });

    expect(output).toContain(
      "Trial: Pick a plan to start your 1-month free trial. No credit card required to start. Add billing later if the trial is a fit.",
    );
    expect(output).not.toContain(". no credit");
    expect(output).not.toContain(". add billing");
  });

  it("does not derive the pricing URL from the signup target", () => {
    const output = buildPricingTxt({
      ...mockConfig,
      funnel: {
        ...mockConfig.funnel,
        bofu: { ...mockConfig.funnel.bofu, ctaTarget: "/start" },
      },
    });

    expect(output).toContain("https://grantpipe.com/pricing/");
    expect(output).not.toContain("https://grantpipe.com/start");
  });

  it("includes the grant-recipient category landing pages", () => {
    const output = buildPricingTxt(mockConfig);

    expect(output).toContain("## Grant Recipient Buying Paths");
    expect(output).toContain("Grant Management Software for Nonprofits");
    expect(output).toContain("https://grantpipe.com/grant-management-software/");
    expect(output).toContain("https://grantpipe.com/grant-compliance-software/");
  });

  it("returns a non-empty string without mojibake", () => {
    const output = buildPricingTxt(mockConfig);
    expect(typeof output).toBe("string");
    expect(output.length).toBeGreaterThan(100);
    expect(output).not.toMatch(/[Ãâ€]/);
  });

  it("publishes the current pricing release date", () => {
    expect(PRICING_TXT_LAST_UPDATED).toBe("2026-07-03");
    expect(buildPricingTxt(mockConfig)).toContain("Last updated: 2026-07-03");
  });

  it("handles tiers without monthlyPriceCents", () => {
    const output = buildPricingTxt({
      ...mockConfig,
      pricingTiers: [
        {
          name: "Basic",
          price: "$30/mo",
          description: "Basic plan",
          features: ["Feature A"],
        },
      ],
    });

    expect(output).toContain("Basic");
    expect(output).toContain("$30/month");
    const basicHeading = output.split("\n").find((line) => line.startsWith("### Basic"));
    expect(basicHeading).toBe("### Basic - $30/month");
  });

  it("formats a generic Enterprise tier as a custom path", () => {
    const output = buildPricingTxt({
      ...mockConfig,
      pricingTiers: [
        {
          name: "Enterprise",
          price: "Custom",
          description: "For unusual grant operations",
          features: [],
        },
      ],
    });

    expect(output).toContain("Purchase path: custom path.");
  });

  it("ignores static launch pricing fields without an annual override", () => {
    const output = buildPricingTxt({
      ...mockConfig,
      pricingTiers: [
        {
          name: "Launch",
          price: "$100/mo",
          monthlyPromoPrice: "$23/mo",
          annualPromoPrice: "$19/mo",
          description: "For a limited launch plan",
          features: [],
        },
      ],
    });

    expect(output).toContain("### Launch - $100/month");
    expect(output).not.toContain("Regular price:");
    expect(output).not.toContain("first-year price");
    expect(output).not.toContain("paid monthly or");
  });

  it("handles config with no pricingTiers gracefully", () => {
    const output = buildPricingTxt({
      ...mockConfig,
      pricingTiers: undefined,
    });

    expect(output).toContain("# GrantPipe Pricing");
  });

  it("handles config with no pricingConfig gracefully", () => {
    const output = buildPricingTxt({
      ...mockConfig,
      pricingConfig: undefined,
    });

    expect(output).toContain("Starter");
    expect(output).not.toContain("Limited time offer");
  });

  it("uses annualPriceOverride when present", () => {
    const output = buildPricingTxt({
      ...mockConfig,
      pricingTiers: [
        {
          name: "Growth",
          price: "$99/mo",
          monthlyPriceCents: 53900,
          annualPriceOverride: "$79/month billed annually",
          description: "For multi-grant nonprofits with reporting pressure",
          features: ["Everything in Starter"],
        },
      ],
    });

    expect(output).toContain("$79/month billed annually");
    expect(output).not.toContain("$450/month billed annually");
  });

  it("handles any highlighted tier", () => {
    const output = buildPricingTxt({
      ...mockConfig,
      pricingTiers: [
        {
          name: "Starter",
          price: "$10/mo",
          monthlyPriceCents: 1000,
          description: "Starter plan",
          features: ["Basic features"],
          highlighted: true,
        },
        {
          name: "Pro",
          price: "$50/mo",
          monthlyPriceCents: 5000,
          description: "Pro plan",
          features: ["All features"],
        },
      ],
    });

    const starterLine = output
      .split("\n")
      .find((line) => line.includes("Starter") && line.startsWith("###"));
    const proLine = output
      .split("\n")
      .find((line) => line.includes("Pro") && line.startsWith("###"));

    expect(starterLine).toContain("[Most Popular]");
    expect(proLine).not.toContain("[Most Popular]");
  });
});
