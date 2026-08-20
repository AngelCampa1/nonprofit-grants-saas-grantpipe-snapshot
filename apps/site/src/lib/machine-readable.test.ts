import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { grantPipeTrialCopy, siteConfig } from "../config/site";
import { buildMachineReadableFacts } from "./machine-readable";

const monthlySuffix = "/mo";
const starterPrice = 21;
const growthPrice = 49;
const grantPipeDefaultPricingFact =
  "Pricing: Starter starts at $39/mo billed annually, Growth starts at $79/mo billed annually, Audit-Ready starts at $159/mo billed annually. Annual totals: Starter $468/yr billed annually, Growth $948/yr billed annually, Audit-Ready $1,908/yr billed annually. Monthly list prices: Starter $49/mo, Growth $99/mo, Audit-Ready $199/mo.";
const staleMonthlyPricingFact =
  "Pricing: Starter $49/month, Growth $99/month, Audit-Ready $199/month";

vi.mock("astro:content", () => ({
  getCollection: vi.fn(async () => []),
}));

describe("buildMachineReadableFacts", () => {
  it("derives pricing, trial, and audience facts from shared site config", () => {
    const facts = buildMachineReadableFacts(siteConfig, grantPipeTrialCopy);

    expect(facts).toEqual([
      grantPipeDefaultPricingFact,
      `Trial: ${grantPipeTrialCopy}`,
      `Audience: ${siteConfig.product.targetAudience}`,
      "Category: Compliance-first grant management system.",
      "Product areas: Compliance calendar, Evidence trail, Restricted funds, Grant pipeline, Donor CRM, Multi-source grant pipeline, Fund accounting, and Auditor and funder portal.",
      "Plan access: GrantPipe spans eight connected areas of work; the pricing page shows what each plan includes.",
      "Founder and author: Angel Campa",
      "Author profile: https://www.linkedin.com/in/angelcampa1/",
      "Company LinkedIn: https://www.linkedin.com/company/grantpipe/",
      "Capability: Multi-source grant pipeline with Grants.gov search is included in every plan.",
      "Active grant definition: For billing-cap purposes, a grant counts as active when its status is awarded, active, reporting, or renewal. Closed, archived, and deleted grants do not count toward plan caps.",
      "Overage policy: Plans include 10-grant soft headroom before hard blocking; grants above the included cap are tracked as pending overage at $10/active grant/month.",
    ]);
    expect(facts).not.toContain(staleMonthlyPricingFact);
  });

  it("uses product pricing and omits optional author/company facts when absent", () => {
    const facts = buildMachineReadableFacts(
      {
        product: {
          name: "GrantPipe",
          price: `$${growthPrice}${monthlySuffix}`,
          targetAudience: "Mid-sized nonprofits",
        },
      } as never,
      "14-day trial",
    );

    expect(facts).toContain(`Pricing: $${growthPrice}/month`);
    expect(facts).toContain("Audience: Mid-sized nonprofits");
    expect(facts).toContain("Category: Compliance-first grant management system.");
    expect(facts.join("\n")).not.toMatch(/grant-funded nonprofits/i);
    expect(facts.join("\n")).not.toMatch(/Compliance-first operating system/i);
    expect(facts.some((fact) => fact.startsWith("Founder and author:"))).toBe(false);
    expect(facts.some((fact) => fact.startsWith("Author profile:"))).toBe(false);
    expect(facts.some((fact) => fact.startsWith("Company LinkedIn:"))).toBe(false);
  });

  it("uses tier pricing and includes optional author/company facts when present", () => {
    const facts = buildMachineReadableFacts(
      {
        product: {
          name: "GrantPipe",
          price: `$${growthPrice}${monthlySuffix}`,
          targetAudience: "Mid-sized nonprofits",
        },
        pricingTiers: [
          { name: "Starter", price: `$${starterPrice}${monthlySuffix}` },
          { name: "Growth", price: `$${growthPrice}${monthlySuffix}` },
        ],
        author: {
          name: "Angel Campa",
          sameAs: ["https://www.linkedin.com/in/angel-campa"],
        },
        sameAs: ["https://www.linkedin.com/company/grantpipe"],
      } as never,
      "14-day trial",
    );

    expect(facts).toContain(
      `Pricing: Starter $${starterPrice}/month, Growth $${growthPrice}/month`,
    );
    expect(facts).toContain("Founder and author: Angel Campa");
    expect(facts).toContain("Author profile: https://www.linkedin.com/in/angel-campa");
    expect(facts).toContain("Company LinkedIn: https://www.linkedin.com/company/grantpipe");
  });

  it("keeps generic Enterprise pricing numeric when no launch pricing is present", () => {
    const facts = buildMachineReadableFacts(
      {
        product: {
          name: "GrantPipe",
          price: `$${growthPrice}${monthlySuffix}`,
          targetAudience: "Mid-sized nonprofits",
        },
        pricingTiers: [{ name: "Enterprise", price: "$999/mo" }],
      } as never,
      "14-day trial",
    );

    expect(facts).toContain("Pricing: Enterprise $999/month");
  });

  it("ignores stale promo fields and keeps machine-readable pricing list-price only", () => {
    const facts = buildMachineReadableFacts(
      {
        product: {
          name: "GrantPipe",
          price: `$${growthPrice}${monthlySuffix}`,
          targetAudience: "Mid-sized nonprofits",
        },
        pricingTiers: [
          {
            name: "Starter",
            price: "$100/mo",
            monthlyPromoPrice: "$22/mo",
          },
          { name: "Enterprise", price: "Contact founder" },
        ],
      } as never,
      "14-day trial",
    );

    expect(facts[0]).toBe("Pricing: Starter $100/month, Enterprise Contact founder");
    expect(facts[0]).not.toContain("first-year price");
    expect(facts[0]).not.toContain("limited-offer");
  });

  it("does not include a launch promo deadline fact when stale promo fields are present", () => {
    const facts = buildMachineReadableFacts(
      {
        product: {
          name: "GrantPipe",
          price: `$${growthPrice}${monthlySuffix}`,
          targetAudience: "Mid-sized nonprofits",
        },
        pricingTiers: [
          {
            name: "Starter",
            price: "$100/mo",
            monthlyPromoPrice: "$22/mo",
          },
        ],
      } as never,
      "14-day trial",
    );
    const deadlineFact = facts.find((f) => f.startsWith("Launch promo:"));
    expect(deadlineFact).toBeUndefined();
  });

  it("does not include a launch promo deadline fact when no launch pricing is present", () => {
    const facts = buildMachineReadableFacts(
      {
        product: {
          name: "GrantPipe",
          price: `$${growthPrice}${monthlySuffix}`,
          targetAudience: "Mid-sized nonprofits",
        },
        pricingTiers: [{ name: "Starter", price: "$100/mo" }],
      } as never,
      "14-day trial",
    );
    expect(facts.some((f) => f.startsWith("Launch promo:"))).toBe(false);
  });

  it("keeps both llms routes wired to shared machine-readable facts", () => {
    const llmsSource = readFileSync(new URL("../pages/llms.txt.ts", import.meta.url), "utf8");
    const llmsFullSource = readFileSync(
      new URL("../pages/llms-full.txt.ts", import.meta.url),
      "utf8",
    );
    const combinedSource = `${llmsSource}\n${llmsFullSource}`;

    expect(llmsSource).toContain("buildMachineReadableFacts(siteConfig, grantPipeTrialCopy)");
    expect(llmsFullSource).toContain("buildMachineReadableFacts(siteConfig, grantPipeTrialCopy)");
    expect(combinedSource).toContain("grant-management-software-for-nonprofits");
    expect(combinedSource).not.toMatch(/OS category/i);
    expect(combinedSource).not.toMatch(/grant-funded-nonprofit-operating-system/i);
  });

  it("renders shared annual-default pricing facts in both llms routes", async () => {
    const [{ GET: getLlmsTxt }, { GET: getLlmsFullTxt }] = await Promise.all([
      import("../pages/llms.txt"),
      import("../pages/llms-full.txt"),
    ]);

    const [llmsResponse, llmsFullResponse] = await Promise.all([
      getLlmsTxt({} as never),
      getLlmsFullTxt({} as never),
    ]);
    const [llmsBody, llmsFullBody] = await Promise.all([
      llmsResponse.text(),
      llmsFullResponse.text(),
    ]);

    expect(llmsBody).toContain(`- ${grantPipeDefaultPricingFact}`);
    expect(llmsFullBody).toContain(`- ${grantPipeDefaultPricingFact}`);
    expect(llmsBody).not.toContain(staleMonthlyPricingFact);
    expect(llmsFullBody).not.toContain(staleMonthlyPricingFact);
  });
});
