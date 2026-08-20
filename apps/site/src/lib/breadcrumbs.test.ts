import { describe, it, expect } from "vitest";
import {
  buildAlternativeBreadcrumbs,
  buildBenchmarkBreadcrumbs,
  buildFaqHubBreadcrumbs,
  buildFeatureBreadcrumbs,
  buildGlossaryBreadcrumbs,
  buildGuideBreadcrumbs,
  buildIntegrationBreadcrumbs,
  buildListicleBreadcrumbs,
  buildPersonaBreadcrumbs,
  buildPricingBreadcrumbs,
  buildCityBreadcrumbs,
  buildStateBreadcrumbs,
  buildVerticalBreadcrumbs,
  buildVersusBreadcrumbs,
  buildWorkflowBreadcrumbs,
} from "./breadcrumbs";

describe("buildAlternativeBreadcrumbs", () => {
  it("returns 4-item breadcrumb trail with correct labels and hrefs", () => {
    const result = buildAlternativeBreadcrumbs("Bloomerang", "bloomerang");
    expect(result).toEqual([
      { label: "Home", href: "/" },
      { label: "Compare", href: "/compare" },
      { label: "Alternatives", href: "/compare/alternatives" },
      {
        label: "Bloomerang Alternative",
        href: "/compare/alternatives/bloomerang",
      },
    ]);
  });

  it("handles slugs with hyphens", () => {
    const result = buildAlternativeBreadcrumbs("Little Green Light", "little-green-light");
    expect(result).toHaveLength(4);
    expect(result[3]).toEqual({
      label: "Little Green Light Alternative",
      href: "/compare/alternatives/little-green-light",
    });
  });
});

describe("buildVersusBreadcrumbs", () => {
  it("returns 4-item breadcrumb trail with vs label", () => {
    const result = buildVersusBreadcrumbs(
      { slug: "bloomerang", name: "Bloomerang" },
      { slug: "donorperfect", name: "DonorPerfect" },
      "/compare/versus/bloomerang-vs-donorperfect",
    );
    expect(result).toEqual([
      { label: "Home", href: "/" },
      { label: "Compare", href: "/compare" },
      { label: "Head-to-Head", href: "/compare/versus" },
      {
        label: "Bloomerang vs DonorPerfect",
        href: "/compare/versus/bloomerang-vs-donorperfect",
      },
    ]);
  });

  it("puts GrantPipe first in the breadcrumb label when it is competitor B", () => {
    const result = buildVersusBreadcrumbs(
      { slug: "bloomerang", name: "Bloomerang" },
      { slug: "grantpipe", name: "GrantPipe" },
      "/compare/versus/grantpipe-vs-bloomerang",
    );

    expect(result[3]).toEqual({
      label: "GrantPipe vs Bloomerang",
      href: "/compare/versus/grantpipe-vs-bloomerang",
    });
  });
});

describe("buildPricingBreadcrumbs", () => {
  it("returns 4-item breadcrumb trail with pricing label", () => {
    const result = buildPricingBreadcrumbs("Bloomerang", "/compare/pricing/bloomerang");
    expect(result).toEqual([
      { label: "Home", href: "/" },
      { label: "Compare", href: "/compare" },
      { label: "Pricing", href: "/compare/pricing" },
      { label: "Bloomerang Pricing", href: "/compare/pricing/bloomerang" },
    ]);
  });
});

describe("buildGuideBreadcrumbs", () => {
  it("returns 4-item breadcrumb trail under Resources > Guides", () => {
    const result = buildGuideBreadcrumbs(
      "How to Choose Nonprofit Software",
      "/resources/guides/how-to-choose-nonprofit-software",
    );
    expect(result).toEqual([
      { label: "Home", href: "/" },
      { label: "Resources", href: "/resources" },
      { label: "Guides", href: "/resources/guides" },
      {
        label: "How to Choose Nonprofit Software",
        href: "/resources/guides/how-to-choose-nonprofit-software",
      },
    ]);
  });
});

describe("buildListicleBreadcrumbs", () => {
  it("returns 4-item breadcrumb trail under Resources > Software Roundups", () => {
    const result = buildListicleBreadcrumbs(
      "Best Nonprofit CRM 2026",
      "/resources/best/best-nonprofit-crm-2026",
    );
    expect(result).toEqual([
      { label: "Home", href: "/" },
      { label: "Resources", href: "/resources" },
      { label: "Software Roundups", href: "/resources/best" },
      {
        label: "Best Nonprofit CRM 2026",
        href: "/resources/best/best-nonprofit-crm-2026",
      },
    ]);
  });
});

describe("buildStateBreadcrumbs", () => {
  it("returns 3-item breadcrumb trail under Nonprofit Software", () => {
    const result = buildStateBreadcrumbs("Texas", "/nonprofit-software/texas");
    expect(result).toEqual([
      { label: "Home", href: "/" },
      { label: "Nonprofit Software", href: "/nonprofit-software" },
      { label: "Texas", href: "/nonprofit-software/texas" },
    ]);
  });
});

describe("buildCityBreadcrumbs", () => {
  it("returns 4-item breadcrumb trail with state link and city leaf", () => {
    const result = buildCityBreadcrumbs(
      "Chicago",
      "Illinois",
      "illinois",
      "/nonprofit-software/illinois/chicago",
    );
    expect(result).toEqual([
      { label: "Home", href: "/" },
      { label: "Nonprofit Software", href: "/nonprofit-software" },
      { label: "Illinois", href: "/nonprofit-software/illinois" },
      { label: "Chicago", href: "/nonprofit-software/illinois/chicago" },
    ]);
  });

  it("handles multi-word city names", () => {
    const result = buildCityBreadcrumbs(
      "New York City",
      "New York",
      "new-york",
      "/nonprofit-software/new-york/new-york-city",
    );
    expect(result).toHaveLength(4);
    expect(result[2]).toEqual({ label: "New York", href: "/nonprofit-software/new-york" });
    expect(result[3]).toEqual({
      label: "New York City",
      href: "/nonprofit-software/new-york/new-york-city",
    });
  });
});

describe("buildVerticalBreadcrumbs", () => {
  it("returns 3-item breadcrumb trail under Solutions", () => {
    const result = buildVerticalBreadcrumbs("Food Banks", "/solutions/food-banks");
    expect(result).toEqual([
      { label: "Home", href: "/" },
      { label: "Solutions", href: "/solutions" },
      { label: "Food Banks", href: "/solutions/food-banks" },
    ]);
  });

  it("handles different vertical types", () => {
    const result = buildVerticalBreadcrumbs(
      "Community Health Clinics",
      "/solutions/community-health-clinics",
    );
    expect(result).toHaveLength(3);
    expect(result[2]).toEqual({
      label: "Community Health Clinics",
      href: "/solutions/community-health-clinics",
    });
  });
});

describe("additional public content breadcrumb builders", () => {
  it("builds persona breadcrumbs", () => {
    expect(buildPersonaBreadcrumbs("Executive Directors", "/for/executive-directors")).toEqual([
      { label: "Home", href: "/" },
      { label: "For", href: "/for" },
      { label: "Executive Directors", href: "/for/executive-directors" },
    ]);
  });

  it("builds workflow breadcrumbs", () => {
    expect(buildWorkflowBreadcrumbs("Grant closeout", "/workflows/grant-closeout")).toEqual([
      { label: "Home", href: "/" },
      { label: "Workflows", href: "/workflows" },
      { label: "Grant closeout", href: "/workflows/grant-closeout" },
    ]);
  });

  it("builds glossary breadcrumbs", () => {
    expect(buildGlossaryBreadcrumbs("Restricted funds", "/glossary/restricted-funds")).toEqual([
      { label: "Home", href: "/" },
      { label: "Glossary", href: "/glossary" },
      { label: "Restricted funds", href: "/glossary/restricted-funds" },
    ]);
  });

  it("builds feature breadcrumbs", () => {
    expect(buildFeatureBreadcrumbs("Audit trail", "/features/audit-trail")).toEqual([
      { label: "Home", href: "/" },
      { label: "Features", href: "/features" },
      { label: "Audit trail", href: "/features/audit-trail" },
    ]);
  });

  it("builds integration breadcrumbs", () => {
    expect(buildIntegrationBreadcrumbs("QuickBooks", "/integrations/quickbooks")).toEqual([
      { label: "Home", href: "/" },
      { label: "Integrations", href: "/integrations" },
      { label: "QuickBooks", href: "/integrations/quickbooks" },
    ]);
  });

  it("builds FAQ hub breadcrumbs", () => {
    expect(
      buildFaqHubBreadcrumbs("Grant Compliance FAQ", "/resources/faq/faq-grant-compliance"),
    ).toEqual([
      { label: "Home", href: "/" },
      { label: "Resources", href: "/resources" },
      { label: "FAQ", href: "/resources/faq" },
      { label: "Grant Compliance FAQ", href: "/resources/faq/faq-grant-compliance" },
    ]);
  });

  it("builds benchmark breadcrumbs", () => {
    expect(
      buildBenchmarkBreadcrumbs(
        "Grant Compliance Benchmarks 2026",
        "/resources/benchmarks/grant-compliance-benchmarks-2026",
      ),
    ).toEqual([
      { label: "Home", href: "/" },
      { label: "Resources", href: "/resources" },
      { label: "Benchmarks", href: "/resources/benchmarks" },
      {
        label: "Grant Compliance Benchmarks 2026",
        href: "/resources/benchmarks/grant-compliance-benchmarks-2026",
      },
    ]);
  });
});
