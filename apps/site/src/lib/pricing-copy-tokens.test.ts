import { describe, expect, it } from "vitest";
import { resolvePricingCopyTokens, resolvePricingCopyTree } from "./pricing-copy-tokens";

describe("pricing copy token resolution", () => {
  it("maps monthly price tokens to list prices", () => {
    expect(
      resolvePricingCopyTokens(
        "Starter {{grantpipe.price.starterMonthly}} to Growth {{grantpipe.price.growthMonthly}}",
      ),
    ).toBe("Starter $49/mo to Growth $99/mo");
  });

  it("maps annual price tokens to annual list prices", () => {
    expect(resolvePricingCopyTokens("{{grantpipe.price.starterAnnual}}")).toBe("$39/mo");
  });

  it("maps stale promo phrases to evergreen list-price language", () => {
    expect(
      resolvePricingCopyTokens(
        "Published rates use current list pricing. GrantPipe publishes flat pricing.",
      ),
    ).toBe("Published rates use current list pricing. GrantPipe publishes flat pricing.");
  });

  it("resolves nested frontmatter objects without changing non-string values", () => {
    expect(
      resolvePricingCopyTree({
        rows: [["GrantPipe", "{{grantpipe.price.auditReadyMonthly}}"]],
        active: true,
        count: 3,
      }),
    ).toEqual({
      rows: [["GrantPipe", "$199/mo"]],
      active: true,
      count: 3,
    });
  });
});
