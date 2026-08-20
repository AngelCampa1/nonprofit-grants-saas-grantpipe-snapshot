import { describe, expect, it } from "vitest";

import {
  buildNonprofitSoftwareHubModel,
  nonprofitSoftwareRegionCopy,
  type NonprofitSoftwareCityEntry,
  type NonprofitSoftwareStateEntry,
} from "./nonprofit-software-hub";

function stateEntry(
  state: string,
  overrides: Partial<NonprofitSoftwareStateEntry["data"]> = {},
): NonprofitSoftwareStateEntry {
  const stateCode = overrides.stateCode ?? state.slice(0, 2).toUpperCase();

  return {
    id: `${state.toLowerCase().replace(/\s+/g, "-")}.md`,
    data: {
      title: `${state} software`,
      description: `${state} description`,
      buyerStage: "tofu",
      publishedAt: "2026-01-01",
      updatedAt: "2026-01-02",
      relatedPages: ["/resources/guides/grant-compliance-101-for-nonprofits"],
      targetPersona: ["executive-director"],
      state,
      stateCode,
      establishmentCount: 1000,
      topMetros: [],
      ...overrides,
    },
  };
}

function cityEntry(
  city: string,
  overrides: Partial<NonprofitSoftwareCityEntry["data"]> = {},
): NonprofitSoftwareCityEntry {
  const state = overrides.state ?? "California";
  const stateCode = overrides.stateCode ?? "CA";
  const citySlug = overrides.citySlug ?? city.toLowerCase().replace(/\s+/g, "-");
  const stateSlug = overrides.stateSlug ?? state.toLowerCase().replace(/\s+/g, "-");

  return {
    id: `${citySlug}.md`,
    data: {
      title: `${city} software`,
      description: `${city} description`,
      buyerStage: "tofu",
      publishedAt: "2026-01-01",
      updatedAt: "2026-01-02",
      relatedPages: ["/resources/guides/grant-compliance-101-for-nonprofits"],
      targetPersona: ["executive-director"],
      city,
      citySlug,
      state,
      stateCode,
      stateSlug,
      nonprofitCount: 1000,
      ...overrides,
    },
  };
}

describe("nonprofit software hub model", () => {
  it("groups state pages by region and carries city counts into each region", () => {
    const model = buildNonprofitSoftwareHubModel({
      stateEntries: [
        stateEntry("California", { stateCode: "CA", establishmentCount: 180000 }),
        stateEntry("New York", { stateCode: "NY", establishmentCount: 120000 }),
        stateEntry("Illinois", { stateCode: "IL", establishmentCount: 50000 }),
        stateEntry("Texas", { stateCode: "TX", establishmentCount: 90000 }),
      ],
      cityEntries: [
        cityEntry("Los Angeles", { state: "California", stateCode: "CA", nonprofitCount: 45000 }),
        cityEntry("New York City", { state: "New York", stateCode: "NY", nonprofitCount: 60000 }),
        cityEntry("Chicago", { state: "Illinois", stateCode: "IL", nonprofitCount: 25000 }),
        cityEntry("Dallas", { state: "Texas", stateCode: "TX", nonprofitCount: 12000 }),
      ],
      stateHrefBuilder: (entry) => `/nonprofit-software/${entry.id.replace(/\.md$/, "")}`,
      cityHrefBuilder: (entry) =>
        `/nonprofit-software/${entry.data.stateSlug}/${entry.data.citySlug}`,
    });

    expect(model.regionSections.map((section) => section.slug)).toEqual([
      "northeast",
      "midwest",
      "south",
      "west",
    ]);
    expect(model.regionSections.find((section) => section.slug === "west")).toMatchObject({
      stateCount: 1,
      cityCount: 1,
      totalNonprofitCount: 180000,
    });
    expect(
      model.regionSections.find((section) => section.slug === "northeast")?.states[0],
    ).toMatchObject({
      title: "New York software",
      href: "/nonprofit-software/new-york",
    });
  });

  it("sorts metro highlights by nonprofit count and caps the list", () => {
    const cities = Array.from({ length: 14 }, (_, index) =>
      cityEntry(`City ${index + 1}`, {
        nonprofitCount: index + 1,
        citySlug: `city-${index + 1}`,
      }),
    );

    const model = buildNonprofitSoftwareHubModel({
      stateEntries: [stateEntry("California", { stateCode: "CA" })],
      cityEntries: cities,
      stateHrefBuilder: (entry) => `/nonprofit-software/${entry.id.replace(/\.md$/, "")}`,
      cityHrefBuilder: (entry) =>
        `/nonprofit-software/${entry.data.stateSlug}/${entry.data.citySlug}`,
    });

    expect(model.metroHighlights).toHaveLength(12);
    expect(model.metroHighlights[0]).toMatchObject({
      title: "City 14 software",
      href: "/nonprofit-software/california/city-14",
      nonprofitCount: 14,
    });
    expect(model.metroOverflowCount).toBe(2);
  });

  it("builds city directory groups by state with stable alphabetical city links", () => {
    const model = buildNonprofitSoftwareHubModel({
      stateEntries: [
        stateEntry("California", { stateCode: "CA" }),
        stateEntry("Texas", { stateCode: "TX" }),
      ],
      cityEntries: [
        cityEntry("San Diego", { state: "California", stateCode: "CA", nonprofitCount: 5 }),
        cityEntry("Anaheim", { state: "California", stateCode: "CA", nonprofitCount: 3 }),
        cityEntry("Austin", {
          state: "Texas",
          stateCode: "TX",
          stateSlug: "texas",
          nonprofitCount: 4,
        }),
      ],
      stateHrefBuilder: (entry) => `/nonprofit-software/${entry.id.replace(/\.md$/, "")}`,
      cityHrefBuilder: (entry) =>
        `/nonprofit-software/${entry.data.stateSlug}/${entry.data.citySlug}`,
    });

    expect(model.cityStateSections.map((section) => section.state)).toEqual([
      "California",
      "Texas",
    ]);
    expect(model.cityStateSections[0]?.cities.map((city) => city.title)).toEqual([
      "Anaheim software",
      "San Diego software",
    ]);
    expect(model.cityStateSections[1]?.href).toBe("/nonprofit-software/texas");
  });

  it("uses safe defaults for missing counts and city-only states", () => {
    const model = buildNonprofitSoftwareHubModel({
      stateEntries: [stateEntry("Nevada", { stateCode: "NV", establishmentCount: undefined })],
      cityEntries: [
        cityEntry("Beta", {
          state: "Oregon",
          stateCode: "OR",
          stateSlug: "oregon",
          nonprofitCount: undefined,
        }),
        cityEntry("Alpha", {
          state: "Oregon",
          stateCode: "OR",
          stateSlug: "oregon",
          nonprofitCount: undefined,
        }),
      ],
      stateHrefBuilder: (entry) => `/nonprofit-software/${entry.id.replace(/\.md$/, "")}`,
      cityHrefBuilder: (entry) =>
        `/nonprofit-software/${entry.data.stateSlug}/${entry.data.citySlug}`,
    });

    expect(model.states[0]?.establishmentCount).toBe(0);
    expect(model.metroHighlights.map((city) => city.city)).toEqual(["Alpha", "Beta"]);
    expect(model.cityStateSections[0]).toMatchObject({
      state: "Oregon",
      href: "/nonprofit-software/oregon",
    });
    expect(model.cityStateSections[0]?.cities[0]?.nonprofitCount).toBe(0);
  });

  it("keeps region copy short and next-step oriented", () => {
    expect(nonprofitSoftwareRegionCopy.west.nextStepLabel).toBe("See West states");
    expect(nonprofitSoftwareRegionCopy.south.description).toBe(
      "Start here for state grants, local funders, and filing rules.",
    );
  });
});
