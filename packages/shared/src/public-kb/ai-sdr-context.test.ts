import { describe, expect, it } from "vitest";

import { FEDERAL_EDITION_SKU } from "../pricing";
import { buildGrantPipeAiSdrProductContext } from "./ai-sdr-context";

describe("buildGrantPipeAiSdrProductContext", () => {
  it("builds the canonical GrantPipe AI-SDR product context", () => {
    const context = buildGrantPipeAiSdrProductContext();

    expect(context.productId).toBe("grantpipe");
    expect(context.name).toBe("GrantPipe");
    expect(context.sources.map((source) => source.id)).toEqual([
      "positioning",
      "pricing",
      "modules",
      "founder-contact",
    ]);
    expect(context.plans.map((plan) => plan.id)).toEqual(["starter", "growth", "audit_ready"]);
    expect(context.plans[0]).toMatchObject({
      id: "starter",
      price: "$39/mo billed annually",
      monthlyPrice: "$49/mo",
      annualPrice: "$39/mo billed annually",
      discount: "",
      defaultCadence: "year",
      trialDays: 30,
      ctaUrl:
        "https://app.grantpipe.com/app/signup?source_section=ai-assistant&cta_page_family=ai-assistant&cta_placement=assistant-answer",
    });
    expect(context.plans.every((plan) => plan.ctaUrl.includes("source_section=ai-assistant"))).toBe(
      true,
    );
    expect(
      context.plans.every((plan) => plan.ctaUrl.includes("cta_placement=assistant-answer")),
    ).toBe(true);
    expect(context.plans.every((plan) => plan.features.length > 0)).toBe(true);
    expect(JSON.stringify(context)).not.toMatch(/\b[MY]80OFF\b/);
  });

  it("publishes Federal Edition as a contact SKU outside self-serve plans", () => {
    const context = buildGrantPipeAiSdrProductContext();

    expect(context.plans.map((plan) => plan.id)).not.toContain(FEDERAL_EDITION_SKU.id);
    expect(context.contactSkus).toEqual([
      {
        id: FEDERAL_EDITION_SKU.id,
        name: FEDERAL_EDITION_SKU.name,
        description: FEDERAL_EDITION_SKU.description,
        priceAnchor: FEDERAL_EDITION_SKU.priceAnchor,
        ctaUrl: "mailto:angel.campa@grantpipe.com",
        ctaLabel: FEDERAL_EDITION_SKU.ctaLabel,
        features: [...FEDERAL_EDITION_SKU.features],
      },
    ]);
  });

  it("keeps founder calendar links out of the public AI-SDR context", () => {
    const context = buildGrantPipeAiSdrProductContext();

    expect(context.meetingLinks).toEqual([]);
    expect(JSON.stringify(context)).not.toMatch(/cal\.com|book a discovery call/i);
    expect(context.contactSkus?.every((sku) => sku.ctaUrl.startsWith("mailto:"))).toBe(true);
  });
});
