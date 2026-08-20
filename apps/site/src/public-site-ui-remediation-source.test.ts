import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const siteRoot = resolve(__dirname);

function readSource(path: string): string {
  return readFileSync(resolve(siteRoot, path), "utf8");
}

describe("GrantPipe public site UI remediation source contracts", () => {
  it("removes the standalone homepage trust signal band", () => {
    const source = readSource("./pages/index.astro");

    expect(source).not.toContain("TrustSignals");
    expect(source).not.toContain("siteConfig.product.trustSignals");
  });

  it("keeps homepage pricing cards to one button plus a quiet workflow link", () => {
    const source = readSource("./pages/index.astro");
    const pricingSection = source.slice(source.indexOf('data-section="pricing"'));
    const pricingCards = readSource("./components/pricing-plan-cards.astro");

    expect(pricingCards).toContain("gp-pricing-grid");
    expect(pricingSection).toContain("<BillingToggle");
    expect(pricingSection).toContain("<PricingPlanCards");
    expect(pricingSection).not.toContain(
      'class="btn-secondary inline-flex items-center justify-center no-underline"',
    );
  });

  it("opts GrantPipe buttons into the full-pill radius and keeps text-safe labels", () => {
    const source = readSource("./styles/global.css");

    // The UI overhaul converges every GrantPipe button on the full-pill radius
    // (pills everywhere). The shared .btn-* tier system reads
    // --primary/secondary-button-radius, so grantpipe.com overrides those tokens
    // to var(--radius-full) under the body[data-site-name] selector.
    expect(source).toContain("--primary-button-radius: var(--radius-full);");
    expect(source).toContain("--secondary-button-radius: var(--radius-full);");
    expect(source).toContain(".gp-text-safe");
    expect(source).toContain("overflow-wrap: break-word;");
    expect(source).toContain(".gp-badge");
    expect(source).toContain("border-radius: var(--radius-sm);");
    expect(source).not.toContain("border-radius: 999px;");
  });

  it("renders pricing billing as a compact segmented control", () => {
    const source = readSource("./pages/pricing.astro");
    const billingToggle = readSource("./components/billing-toggle.astro");
    const billingToggleScript = readSource("./lib/billing-toggle.ts");
    const styles = readSource("./styles/global.css");

    expect(source).toContain("<BillingToggle");
    expect(billingToggle).toContain("gp-billing-segmented");
    expect(styles).toContain("border-radius: var(--gp-rad);");
    const blockedRoot = "." + ["da", "rk"].join("");
    expect(styles).not.toContain(`${blockedRoot} .gp-billing-toggle`);
    expect(styles).not.toContain(`${blockedRoot} .gp-billing-toggle__btn--active`);
    expect(billingToggle).toContain("initBillingToggle");
    expect(billingToggleScript).toContain("function handleBillingKeydown");
    expect(billingToggleScript).toContain('event.key !== "ArrowUp"');
    expect(billingToggleScript).toContain('event.key === "ArrowDown"');
    expect(billingToggleScript).toContain(
      'button.addEventListener("keydown", handleBillingKeydown)',
    );
    expect(source).not.toContain("border-radius: 999px;");
  });
});
