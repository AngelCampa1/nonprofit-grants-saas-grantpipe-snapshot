import { describe, it, expect } from "vitest";
import {
  padToolIndex,
  buildOptionalHowToSchema,
  buildContentMap,
  buildVersusComparisonLabel,
  buildVersusComparisonPath,
  normalizeVersusComparisonTitle,
  orderListicleToolsGrantPipeFirst,
  orderVersusSubjects,
} from "./page-helpers";
import type { CollectionEntry } from "astro:content";

// ---------------------------------------------------------------------------
// Stub factories — only the fields accessed by buildContentMap / page helpers
// ---------------------------------------------------------------------------

function makeAlternative(
  competitorSlug: string,
  title: string,
  description: string,
): CollectionEntry<"alternatives"> {
  return {
    id: `${competitorSlug}.md`,
    slug: competitorSlug,
    body: "",
    collection: "alternatives",
    data: {
      title,
      description,
      competitor: {
        slug: competitorSlug,
        name: "Competitor",
        pricing: "$99",
        weakness: "",
      },
    },
    render: async () => ({
      Content: () => null,
      headings: [],
      remarkPluginFrontmatter: {},
    }),
  } as unknown as CollectionEntry<"alternatives">;
}

function makeComparison(
  slugA: string,
  slugB: string,
  title: string,
  description: string,
  nameA = "A",
  nameB = "B",
): CollectionEntry<"comparisons"> {
  return {
    id: `${slugA}-vs-${slugB}.md`,
    slug: `${slugA}-vs-${slugB}`,
    body: "",
    collection: "comparisons",
    data: {
      title,
      description,
      competitorA: { slug: slugA, name: nameA },
      competitorB: { slug: slugB, name: nameB },
    },
    render: async () => ({
      Content: () => null,
      headings: [],
      remarkPluginFrontmatter: {},
    }),
  } as unknown as CollectionEntry<"comparisons">;
}

function makePricingBreakdown(
  competitorSlug: string,
  title: string,
  description: string,
): CollectionEntry<"pricing-breakdowns"> {
  return {
    id: `${competitorSlug}.md`,
    slug: competitorSlug,
    body: "",
    collection: "pricing-breakdowns",
    data: {
      title,
      description,
      competitor: { slug: competitorSlug, name: "Competitor", pricing: "$99" },
    },
    render: async () => ({
      Content: () => null,
      headings: [],
      remarkPluginFrontmatter: {},
    }),
  } as unknown as CollectionEntry<"pricing-breakdowns">;
}

function makeListicle(
  id: string,
  title: string,
  description: string,
): CollectionEntry<"listicles"> {
  return {
    id,
    slug: id.replace(/\.md$/, ""),
    body: "",
    collection: "listicles",
    data: { title, description },
    render: async () => ({
      Content: () => null,
      headings: [],
      remarkPluginFrontmatter: {},
    }),
  } as unknown as CollectionEntry<"listicles">;
}

function makeGuide(id: string, title: string, description: string): CollectionEntry<"guides"> {
  return {
    id,
    slug: id.replace(/\.md$/, ""),
    body: "",
    collection: "guides",
    data: { title, description },
    render: async () => ({
      Content: () => null,
      headings: [],
      remarkPluginFrontmatter: {},
    }),
  } as unknown as CollectionEntry<"guides">;
}

function makeStatePage(
  slug: string,
  title: string,
  description: string,
): CollectionEntry<"state-pages"> {
  return {
    id: `${slug}.md`,
    slug,
    body: "",
    collection: "state-pages",
    data: { title, description, state: "California", stateCode: "CA" },
    render: async () => ({
      Content: () => null,
      headings: [],
      remarkPluginFrontmatter: {},
    }),
  } as unknown as CollectionEntry<"state-pages">;
}

function makeCityPage(
  slug: string,
  title: string,
  description: string,
): CollectionEntry<"city-pages"> {
  return {
    id: `${slug}.md`,
    slug,
    body: "",
    collection: "city-pages",
    data: { title, description, city: "Austin", state: "Texas", stateCode: "TX" },
    render: async () => ({
      Content: () => null,
      headings: [],
      remarkPluginFrontmatter: {},
    }),
  } as unknown as CollectionEntry<"city-pages">;
}

function makeVerticalPage(
  slug: string,
  title: string,
  description: string,
): CollectionEntry<"vertical-pages"> {
  return {
    id: `${slug}.md`,
    slug,
    body: "",
    collection: "vertical-pages",
    data: { title, description, verticalType: "Faith-Based Organizations" },
    render: async () => ({
      Content: () => null,
      headings: [],
      remarkPluginFrontmatter: {},
    }),
  } as unknown as CollectionEntry<"vertical-pages">;
}

function makeLeadMagnet(
  slug: string,
  title: string,
  description: string,
): CollectionEntry<"lead-magnets"> {
  return {
    id: `${slug}.md`,
    slug,
    body: "",
    collection: "lead-magnets",
    data: {
      title,
      description,
      publishedAt: "2026-01-01",
      updatedAt: "2026-01-01",
      bluf: "Summary",
      relatedPages: ["/compare/alternatives/bloomerang"],
    },
    render: async () => ({
      Content: () => null,
      headings: [],
      remarkPluginFrontmatter: {},
    }),
  } as unknown as CollectionEntry<"lead-magnets">;
}

function makeOptionalEntry(collection: string, slug: string, title: string, description: string) {
  return {
    id: `${slug}.md`,
    body: "",
    collection,
    data: { title, description },
    render: async () => ({
      Content: () => null,
      headings: [],
      remarkPluginFrontmatter: {},
    }),
  };
}

function emptyCollections() {
  return {
    alternatives: [],
    comparisons: [],
    pricingBreakdowns: [],
    listicles: [],
    guides: [],
    statePages: [],
    cityPages: [],
    verticalPages: [],
    leadMagnets: [],
  };
}

// ---------------------------------------------------------------------------
// buildContentMap
// ---------------------------------------------------------------------------

describe("buildContentMap", () => {
  it("returns an empty map when all collections are empty", () => {
    const map = buildContentMap(emptyCollections());
    expect(map.size).toBe(9);
    expect(map.has("/product")).toBe(true);
    expect(map.has("/pricing")).toBe(true);
    expect(map.has("/grant-management-software")).toBe(true);
    expect(map.has("/grant-compliance-software")).toBe(true);
    expect(map.has("/grant-tracking-software")).toBe(true);
    expect(map.has("/restricted-fund-tracking-software")).toBe(true);
    expect(map.has("/grant-reporting-software")).toBe(true);
    expect(map.has("/auditor-funder-portal-software")).toBe(true);
    expect(map.has("/subrecipient-monitoring-software")).toBe(true);
  });

  it("maps alternatives using /compare/alternatives/{competitor.slug}", () => {
    const entry = makeAlternative(
      "bloomerang",
      "Bloomerang Alternative",
      "A great alternative page",
    );
    const map = buildContentMap({
      ...emptyCollections(),
      alternatives: [entry],
    });

    expect(map.has("/compare/alternatives/bloomerang")).toBe(true);
    const result = map.get("/compare/alternatives/bloomerang");
    expect(result?.title).toBe("Bloomerang Alternative");
    expect(result?.description).toBe("A great alternative page");
  });

  it("maps comparisons using /compare/versus/{competitorA.slug}-vs-{competitorB.slug}", () => {
    const entry = makeComparison(
      "bloomerang",
      "salesforce",
      "Bloomerang vs Salesforce",
      "Compare the two",
    );
    const map = buildContentMap({
      ...emptyCollections(),
      comparisons: [entry],
    });

    expect(map.has("/compare/versus/bloomerang-vs-salesforce")).toBe(true);
    const result = map.get("/compare/versus/bloomerang-vs-salesforce");
    expect(result?.title).toBe("Bloomerang vs Salesforce");
    expect(result?.description).toBe("Compare the two");
  });

  it("normalizes GrantPipe comparison map keys and titles when GrantPipe is competitor B", () => {
    const entry = makeComparison(
      "bloomerang",
      "grantpipe",
      "Bloomerang vs GrantPipe: Pricing and Fit",
      "Compare the two",
      "Bloomerang",
      "GrantPipe",
    );
    const map = buildContentMap({
      ...emptyCollections(),
      comparisons: [entry],
    });

    expect(map.has("/compare/versus/grantpipe-vs-bloomerang")).toBe(true);
    expect(map.has("/compare/versus/bloomerang-vs-grantpipe")).toBe(true);
    expect(map.get("/compare/versus/grantpipe-vs-bloomerang")?.title).toBe(
      "GrantPipe vs Bloomerang: Pricing and Fit",
    );
    expect(map.get("/compare/versus/bloomerang-vs-grantpipe")?.title).toBe(
      "GrantPipe vs Bloomerang: Pricing and Fit",
    );
  });

  it("maps pricing-breakdowns using /compare/pricing/{competitor.slug}", () => {
    const entry = makePricingBreakdown(
      "salesforce-npsp",
      "Salesforce NPSP Pricing",
      "Full pricing breakdown",
    );
    const map = buildContentMap({
      ...emptyCollections(),
      pricingBreakdowns: [entry],
    });

    expect(map.has("/compare/pricing/salesforce-npsp")).toBe(true);
    const result = map.get("/compare/pricing/salesforce-npsp");
    expect(result?.title).toBe("Salesforce NPSP Pricing");
    expect(result?.description).toBe("Full pricing breakdown");
  });

  it("maps listicles using /resources/best/{entry.id}", () => {
    const entry = makeListicle(
      "best-grant-management-software.md",
      "Best Grant Management Software",
      "Top picks for nonprofits",
    );
    const map = buildContentMap({ ...emptyCollections(), listicles: [entry] });

    expect(map.has("/resources/best/best-grant-management-software")).toBe(true);
    const result = map.get("/resources/best/best-grant-management-software");
    expect(result?.title).toBe("Best Grant Management Software");
    expect(result?.description).toBe("Top picks for nonprofits");
  });

  it("maps guides using /resources/guides/{entry.id}", () => {
    const entry = makeGuide(
      "how-to-choose-nonprofit-crm.md",
      "How to Choose a Nonprofit CRM",
      "Step-by-step guide",
    );
    const map = buildContentMap({ ...emptyCollections(), guides: [entry] });

    expect(map.has("/resources/guides/how-to-choose-nonprofit-crm")).toBe(true);
    const result = map.get("/resources/guides/how-to-choose-nonprofit-crm");
    expect(result?.title).toBe("How to Choose a Nonprofit CRM");
    expect(result?.description).toBe("Step-by-step guide");
  });

  it("maps state-pages using /nonprofit-software/{entry.id}", () => {
    const entry = makeStatePage(
      "california",
      "Nonprofit Software California",
      "Grant management in California",
    );
    const map = buildContentMap({
      ...emptyCollections(),
      statePages: [entry],
    });

    expect(map.has("/nonprofit-software/california")).toBe(true);
    const result = map.get("/nonprofit-software/california");
    expect(result?.title).toBe("Nonprofit Software California");
    expect(result?.description).toBe("Grant management in California");
  });

  it("maps city-pages using /nonprofit-software/{state}/{city}", () => {
    const entry = makeCityPage(
      "texas/austin",
      "Nonprofit Software Austin",
      "Grant management in Austin",
    );
    const map = buildContentMap({
      ...emptyCollections(),
      cityPages: [entry],
    });

    expect(map.has("/nonprofit-software/texas/austin")).toBe(true);
    expect(map.get("/nonprofit-software/texas/austin")).toEqual({
      title: "Nonprofit Software Austin",
      description: "Grant management in Austin",
    });
  });

  it("maps vertical-pages using /solutions/{entry.id}", () => {
    const entry = makeVerticalPage(
      "faith-based-organizations",
      "Grant Management for Faith-Based Organizations",
      "Tailored for churches and religious nonprofits",
    );
    const map = buildContentMap({
      ...emptyCollections(),
      verticalPages: [entry],
    });

    expect(map.has("/solutions/faith-based-organizations")).toBe(true);
    const result = map.get("/solutions/faith-based-organizations");
    expect(result?.title).toBe("Grant Management for Faith-Based Organizations");
    expect(result?.description).toBe("Tailored for churches and religious nonprofits");
  });

  it("maps lead-magnets using /free/{entry.id}", () => {
    const entry = makeLeadMagnet(
      "grant-compliance-checklist",
      "Free Grant Compliance Checklist",
      "Download our compliance checklist",
    );
    const map = buildContentMap({
      ...emptyCollections(),
      leadMagnets: [entry],
    });

    expect(map.has("/free/grant-compliance-checklist")).toBe(true);
    const result = map.get("/free/grant-compliance-checklist");
    expect(result?.title).toBe("Free Grant Compliance Checklist");
    expect(result?.description).toBe("Download our compliance checklist");
  });

  it("maps manual grant category landing pages", () => {
    const map = buildContentMap(emptyCollections());

    expect(map.has("/grant-management-software")).toBe(true);
    expect(map.get("/grant-management-software")?.title).toBe(
      "Grant Management Software for Nonprofits",
    );
    expect(map.has("/grant-compliance-software")).toBe(true);
    expect(map.has("/grant-tracking-software")).toBe(true);
    expect(map.has("/restricted-fund-tracking-software")).toBe(true);
    expect(map.has("/grant-reporting-software")).toBe(true);
  });

  it("merges all core collections into one map", () => {
    const alt = makeAlternative("bloomerang", "Bloomerang Alt", "desc1");
    const comp = makeComparison("bloomerang", "salesforce", "Bloomerang vs Salesforce", "desc2");
    const pricing = makePricingBreakdown("salesforce-npsp", "Salesforce Pricing", "desc3");
    const listicle = makeListicle("best-grant-software.md", "Best Grant Software", "desc4");
    const guide = makeGuide("how-to-choose-crm.md", "How to Choose a CRM", "desc5");
    const statePage = makeStatePage("texas", "Nonprofit Software Texas", "desc6");
    const cityPage = makeCityPage("texas/austin", "Nonprofit Software Austin", "desc6b");
    const verticalPage = makeVerticalPage("hospitals", "Grant Management for Hospitals", "desc7");
    const leadMagnet = makeLeadMagnet(
      "grant-compliance-checklist",
      "Free Grant Compliance Checklist",
      "desc8",
    );

    const map = buildContentMap({
      alternatives: [alt],
      comparisons: [comp],
      pricingBreakdowns: [pricing],
      listicles: [listicle],
      guides: [guide],
      statePages: [statePage],
      cityPages: [cityPage],
      verticalPages: [verticalPage],
      leadMagnets: [leadMagnet],
    });

    expect(map.size).toBe(18);
    expect(map.has("/product")).toBe(true);
    expect(map.has("/pricing")).toBe(true);
    expect(map.has("/compare/alternatives/bloomerang")).toBe(true);
    expect(map.has("/compare/versus/bloomerang-vs-salesforce")).toBe(true);
    expect(map.has("/compare/pricing/salesforce-npsp")).toBe(true);
    expect(map.has("/resources/best/best-grant-software")).toBe(true);
    expect(map.has("/resources/guides/how-to-choose-crm")).toBe(true);
    expect(map.has("/nonprofit-software/texas")).toBe(true);
    expect(map.has("/nonprofit-software/texas/austin")).toBe(true);
    expect(map.has("/solutions/hospitals")).toBe(true);
    expect(map.has("/free/grant-compliance-checklist")).toBe(true);
    expect(map.has("/grant-management-software")).toBe(true);
    expect(map.has("/grant-compliance-software")).toBe(true);
    expect(map.has("/grant-tracking-software")).toBe(true);
    expect(map.has("/restricted-fund-tracking-software")).toBe(true);
    expect(map.has("/grant-reporting-software")).toBe(true);
    expect(map.has("/auditor-funder-portal-software")).toBe(true);
    expect(map.has("/subrecipient-monitoring-software")).toBe(true);
  });

  it("copies title and description accurately from entry.data", () => {
    const entry = makeAlternative("test-slug", "Exact Title Here", "Exact description here");
    const map = buildContentMap({
      ...emptyCollections(),
      alternatives: [entry],
    });
    const result = map.get("/compare/alternatives/test-slug");
    expect(result?.title).toBe("Exact Title Here");
    expect(result?.description).toBe("Exact description here");
  });

  it("maps optional persona, workflow, glossary, feature, integration, FAQ, and benchmark collections", () => {
    const map = buildContentMap({
      ...emptyCollections(),
      personas: [
        makeOptionalEntry(
          "personas",
          "executive-directors",
          "Executive Directors",
          "Leadership workflows",
        ) as unknown as CollectionEntry<"personas">,
      ],
      workflows: [
        makeOptionalEntry(
          "workflows",
          "grant-closeout",
          "Grant Closeout",
          "Closeout steps",
        ) as unknown as CollectionEntry<"workflows">,
      ],
      glossary: [
        makeOptionalEntry(
          "glossary",
          "restricted-funds",
          "Restricted Funds",
          "Term definition",
        ) as unknown as CollectionEntry<"glossary">,
      ],
      features: [
        makeOptionalEntry(
          "features",
          "audit-trail",
          "Audit Trail",
          "Feature overview",
        ) as unknown as CollectionEntry<"features">,
      ],
      integrations: [
        makeOptionalEntry(
          "integrations",
          "quickbooks",
          "QuickBooks",
          "Integration overview",
        ) as unknown as CollectionEntry<"integrations">,
      ],
      faqHubs: [
        makeOptionalEntry(
          "faq-hubs",
          "texas-nonprofit-faq",
          "Texas Nonprofit FAQ",
          "FAQ overview",
        ) as unknown as CollectionEntry<"faq-hubs">,
      ],
      benchmarks: [
        makeOptionalEntry(
          "benchmarks",
          "nonprofit-audit-benchmarks-2026",
          "Nonprofit Audit Benchmarks",
          "Benchmark overview",
        ) as unknown as CollectionEntry<"benchmarks">,
      ],
    });

    expect(map.get("/for/executive-directors")).toEqual({
      title: "Executive Directors",
      description: "Leadership workflows",
    });
    expect(map.get("/workflows/grant-closeout")).toEqual({
      title: "Grant Closeout",
      description: "Closeout steps",
    });
    expect(map.get("/glossary/restricted-funds")).toEqual({
      title: "Restricted Funds",
      description: "Term definition",
    });
    expect(map.get("/features/audit-trail")).toEqual({
      title: "Audit Trail",
      description: "Feature overview",
    });
    expect(map.get("/integrations/quickbooks")).toEqual({
      title: "QuickBooks",
      description: "Integration overview",
    });
    expect(map.get("/resources/faq/texas-nonprofit-faq")).toEqual({
      title: "Texas Nonprofit FAQ",
      description: "FAQ overview",
    });
    expect(map.get("/resources/benchmarks/nonprofit-audit-benchmarks-2026")).toEqual({
      title: "Nonprofit Audit Benchmarks",
      description: "Benchmark overview",
    });
  });
});

// ---------------------------------------------------------------------------
// padToolIndex
// ---------------------------------------------------------------------------

describe("padToolIndex", () => {
  it("pads single digit index to 2 digits", () => {
    expect(padToolIndex(0)).toBe("01");
  });

  it("pads index 9 (becomes 10) correctly", () => {
    expect(padToolIndex(9)).toBe("10");
  });

  it("does not pad 3-digit results", () => {
    expect(padToolIndex(99)).toBe("100");
  });

  it("pads index 4 to '05'", () => {
    expect(padToolIndex(4)).toBe("05");
  });
});

describe("GrantPipe versus helpers", () => {
  it("keeps existing order when GrantPipe is not involved", () => {
    expect(
      orderVersusSubjects(
        { slug: "bloomerang", name: "Bloomerang" },
        { slug: "donorperfect", name: "DonorPerfect" },
      ),
    ).toEqual([
      { slug: "bloomerang", name: "Bloomerang" },
      { slug: "donorperfect", name: "DonorPerfect" },
    ]);
  });

  it("moves GrantPipe into the first position when it appears second", () => {
    expect(
      orderVersusSubjects(
        { slug: "bloomerang", name: "Bloomerang" },
        { slug: "grantpipe", name: "GrantPipe" },
      ),
    ).toEqual([
      { slug: "grantpipe", name: "GrantPipe" },
      { slug: "bloomerang", name: "Bloomerang" },
    ]);
  });

  it("builds GrantPipe-first labels, paths, and titles", () => {
    const competitorA = { slug: "bloomerang", name: "Bloomerang" };
    const competitorB = { slug: "grantpipe", name: "GrantPipe" };

    expect(buildVersusComparisonLabel(competitorA, competitorB)).toBe("GrantPipe vs Bloomerang");
    expect(buildVersusComparisonPath(competitorA, competitorB)).toBe(
      "/compare/versus/grantpipe-vs-bloomerang",
    );
    expect(
      normalizeVersusComparisonTitle(
        "Bloomerang vs GrantPipe: Pricing and Fit [2026]",
        competitorA,
        competitorB,
      ),
    ).toBe("GrantPipe vs Bloomerang: Pricing and Fit [2026]");
  });

  it("normalizes comparison labels even when they appear later in the title", () => {
    expect(
      normalizeVersusComparisonTitle(
        "Best fit: Bloomerang vs GrantPipe for grant-heavy teams",
        { slug: "bloomerang", name: "Bloomerang" },
        { slug: "grantpipe", name: "GrantPipe" },
      ),
    ).toBe("Best fit: GrantPipe vs Bloomerang for grant-heavy teams");
  });

  it("normalizes comparison labels case-insensitively", () => {
    expect(
      normalizeVersusComparisonTitle(
        "best fit: bloomerang vs grantpipe for grant-heavy teams",
        { slug: "bloomerang", name: "Bloomerang" },
        { slug: "grantpipe", name: "GrantPipe" },
      ),
    ).toBe("best fit: GrantPipe vs Bloomerang for grant-heavy teams");
  });
});

describe("orderListicleToolsGrantPipeFirst", () => {
  it("moves GrantPipe to the first tool position", () => {
    const ordered = orderListicleToolsGrantPipeFirst([
      { name: "Bloomerang", summary: "Donor CRM" },
      { name: "GrantPipe", summary: "Unified donor and grant workflow" },
    ]);

    expect(ordered.map((tool) => tool.name)).toEqual(["GrantPipe", "Bloomerang"]);
  });

  it("preserves non-GrantPipe order after GrantPipe", () => {
    const ordered = orderListicleToolsGrantPipeFirst([
      { name: "Bloomerang", summary: "Donor CRM" },
      { name: "GrantPipe", summary: "Unified donor and grant workflow" },
      { name: "DonorPerfect", summary: "Donor database" },
    ]);

    expect(ordered.map((tool) => tool.name)).toEqual(["GrantPipe", "Bloomerang", "DonorPerfect"]);
  });
});

// ---------------------------------------------------------------------------
// buildOptionalHowToSchema
// ---------------------------------------------------------------------------

describe("buildOptionalHowToSchema", () => {
  it("returns null when steps is undefined", () => {
    expect(buildOptionalHowToSchema(undefined, "Guide", "A description")).toBeNull();
  });

  it("returns null when steps is empty array", () => {
    expect(buildOptionalHowToSchema([], "Guide", "A description")).toBeNull();
  });

  it("returns a valid HowTo schema when steps are provided", () => {
    const steps = [
      { title: "Step One", content: "Do the first thing" },
      { title: "Step Two", content: "Do the second thing" },
    ];
    const result = buildOptionalHowToSchema(steps, "My Guide", "A helpful guide");

    expect(result).not.toBeNull();
    expect(result!["@type"]).toBe("HowTo");
    expect(result!["name"]).toBe("My Guide");
    expect(result!["description"]).toBe("A helpful guide");

    const schemaSteps = result!["step"] as Array<Record<string, unknown>>;
    expect(schemaSteps).toHaveLength(2);
    expect(schemaSteps[0]).toEqual({
      "@type": "HowToStep",
      position: 1,
      name: "Step One",
      text: "Do the first thing",
    });
    expect(schemaSteps[1]).toEqual({
      "@type": "HowToStep",
      position: 2,
      name: "Step Two",
      text: "Do the second thing",
    });
  });

  it("returns schema with single step", () => {
    const steps = [{ title: "Only Step", content: "Do it" }];
    const result = buildOptionalHowToSchema(steps, "Quick Guide", "desc");
    expect(result).not.toBeNull();
    const schemaSteps = result!["step"] as Array<Record<string, unknown>>;
    expect(schemaSteps).toHaveLength(1);
  });
});
