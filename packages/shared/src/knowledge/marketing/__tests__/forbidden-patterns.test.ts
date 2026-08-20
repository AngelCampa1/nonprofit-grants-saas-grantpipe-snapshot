import { describe, expect, it } from "vitest";
import { FORBIDDEN_PATTERNS } from "../forbidden-patterns";

describe("FORBIDDEN_PATTERNS", () => {
  it("is non-empty", () => {
    expect(FORBIDDEN_PATTERNS.length).toBeGreaterThan(0);
  });

  it("every entry has name, RegExp pattern, and reason", () => {
    for (const entry of FORBIDDEN_PATTERNS) {
      expect(typeof entry.name).toBe("string");
      expect(entry.name.length).toBeGreaterThan(0);
      expect(entry.pattern).toBeInstanceOf(RegExp);
      expect(typeof entry.reason).toBe("string");
      expect(entry.reason.length).toBeGreaterThan(0);
    }
  });

  it("matches a fabricated GrantPipe user-count claim but not competitor characterizations", () => {
    const userCount = FORBIDDEN_PATTERNS.find((p) => p.name === "grantpipe-fabricated-user-count");
    expect(userCount).toBeDefined();
    expect(userCount!.pattern.test("GrantPipe is used by 2,500 nonprofits")).toBe(true);
    expect(userCount!.pattern.test("GrantPipe is trusted by 500 organizations")).toBe(true);
    expect(userCount!.pattern.test("Join the GrantPipe community of 1,200 nonprofits")).toBe(true);

    // Competitor descriptions must NOT match
    expect(userCount!.pattern.test("Sage Intacct is used by 25,000 organizations")).toBe(false);
    expect(userCount!.pattern.test("Salesforce, trusted by 150,000 organizations")).toBe(false);
    expect(userCount!.pattern.test("Box, trusted by 500 organizations worldwide")).toBe(false);
    expect(userCount!.pattern.test("Join 25 nonprofits in our cohort")).toBe(false);
    expect(userCount!.pattern.test("Loved by organizations under $500K")).toBe(false);
  });

  it("matches a first-person sector-experience claim", () => {
    const sector = FORBIDDEN_PATTERNS.find((p) => p.name === "first-person-sector-experience");
    expect(sector).toBeDefined();
    expect(sector!.pattern.test("After my 10 years as a fundraising director")).toBe(true);
    expect(sector!.pattern.test("After 10 years of building software")).toBe(false);
  });

  it("matches a customer testimonial attributed to a nonprofit role", () => {
    const testimonial = FORBIDDEN_PATTERNS.find((p) => p.name === "grantpipe-testimonial-quote");
    expect(testimonial).toBeDefined();
    expect(
      testimonial!.pattern.test(
        '"GrantPipe transformed our compliance reporting" — Executive Director, Acme Foundation',
      ),
    ).toBe(true);
  });

  it("matches a first-person grant achievement claim", () => {
    const achievement = FORBIDDEN_PATTERNS.find((p) => p.name === "first-person-grant-achievement");
    expect(achievement).toBeDefined();
    expect(achievement!.pattern.test("I've personally written grants for over 50 nonprofits")).toBe(
      true,
    );
  });

  it("matches retired operating-system positioning without blocking competitor context", () => {
    const oldCategory = FORBIDDEN_PATTERNS.find(
      (p) => p.name === "old-operating-system-positioning",
    );
    const grantPipeCategory = FORBIDDEN_PATTERNS.find(
      (p) => p.name === "grantpipe-operating-system-positioning",
    );
    const genericHook = FORBIDDEN_PATTERNS.find((p) => p.name === "generic-operating-system-hook");

    expect(oldCategory).toBeDefined();
    expect(grantPipeCategory).toBeDefined();
    expect(genericHook).toBeDefined();

    expect(oldCategory!.pattern.test("a unified restricted-fund operating system")).toBe(true);
    expect(oldCategory!.pattern.test("a full post-award operating system")).toBe(true);
    expect(oldCategory!.pattern.test("the operating system for restricted funds")).toBe(true);
    expect(oldCategory!.pattern.test("It is an operating-system problem.")).toBe(true);
    expect(oldCategory!.pattern.test("inside the operating system")).toBe(true);
    expect(grantPipeCategory!.pattern.test("GrantPipe is a nonprofit operating system.")).toBe(
      true,
    );
    expect(genericHook!.pattern.test("Your CRM is not your operating system.")).toBe(true);

    expect(
      oldCategory!.pattern.test("Salesforce is not a finished nonprofit operating system."),
    ).toBe(false);
    expect(oldCategory!.pattern.test("Instrumentl is not a post-award operating system.")).toBe(
      false,
    );
    expect(
      oldCategory!.pattern.test("That product is not a restricted-fund operating system."),
    ).toBe(false);
    expect(
      grantPipeCategory!.pattern.test("GrantPipe is a compliance-first grant management system."),
    ).toBe(false);
  });
});
