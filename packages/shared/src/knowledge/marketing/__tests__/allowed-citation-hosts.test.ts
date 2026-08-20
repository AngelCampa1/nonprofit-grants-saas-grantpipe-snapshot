import { describe, expect, it } from "vitest";
import { ALLOWED_CITATION_HOSTS, isAllowedCitationHost } from "../allowed-citation-hosts";

describe("ALLOWED_CITATION_HOSTS", () => {
  it("is non-empty and contains primary sources", () => {
    expect(ALLOWED_CITATION_HOSTS.length).toBeGreaterThan(0);
    expect(ALLOWED_CITATION_HOSTS).toContain("gao.gov");
    expect(ALLOWED_CITATION_HOSTS).toContain("irs.gov");
    expect(ALLOWED_CITATION_HOSTS).toContain("nff.org");
  });
});

describe("isAllowedCitationHost", () => {
  it("accepts an exact-match allowlisted host", () => {
    expect(isAllowedCitationHost("https://gao.gov/products/gao-24-106173")).toBe(true);
  });

  it("accepts a subdomain of an allowlisted host", () => {
    expect(isAllowedCitationHost("https://nccs.urban.org/data")).toBe(true);
  });

  it("rejects an unrelated host", () => {
    expect(isAllowedCitationHost("https://example.com/anything")).toBe(false);
  });

  it("rejects an invalid URL", () => {
    expect(isAllowedCitationHost("not a url")).toBe(false);
  });

  it("rejects a host that merely contains an allowlisted suffix as a substring", () => {
    expect(isAllowedCitationHost("https://nottirs.gov.evil.com/")).toBe(false);
  });
});
