import type { BuyerStage, ContentItem } from "@grantpipe/ui/site";
import { mapToContentItems } from "@grantpipe/ui/site/lib/collections";

export type NonprofitSoftwareRegionSlug = "northeast" | "midwest" | "south" | "west";

export interface NonprofitSoftwareStateEntry {
  id: string;
  data: {
    title: string;
    description: string;
    buyerStage: BuyerStage;
    publishedAt: string;
    updatedAt: string;
    relatedPages?: string[];
    targetPersona?: string[];
    state: string;
    stateCode: string;
    establishmentCount?: number;
    topMetros?: Array<{ name: string; count?: number }>;
  };
}

export interface NonprofitSoftwareCityEntry {
  id: string;
  data: {
    title: string;
    description: string;
    buyerStage: BuyerStage;
    publishedAt: string;
    updatedAt: string;
    relatedPages?: string[];
    targetPersona?: string[];
    city: string;
    citySlug: string;
    state: string;
    stateCode: string;
    stateSlug: string;
    nonprofitCount?: number;
  };
}

export interface NonprofitSoftwareRegionCopy {
  title: string;
  description: string;
  nextStepLabel: string;
}

export interface NonprofitSoftwareStateItem extends ContentItem {
  state: string;
  stateCode: string;
  establishmentCount: number;
}

export interface NonprofitSoftwareCityItem extends ContentItem {
  city: string;
  state: string;
  stateCode: string;
  stateSlug: string;
  nonprofitCount: number;
}

export interface NonprofitSoftwareRegionSection extends NonprofitSoftwareRegionCopy {
  slug: NonprofitSoftwareRegionSlug;
  states: NonprofitSoftwareStateItem[];
  stateCount: number;
  cityCount: number;
  totalNonprofitCount: number;
}

export interface NonprofitSoftwareCityStateSection {
  state: string;
  stateCode: string;
  href: string;
  cities: NonprofitSoftwareCityItem[];
}

export interface NonprofitSoftwareHubModel {
  states: NonprofitSoftwareStateItem[];
  cities: NonprofitSoftwareCityItem[];
  regionSections: NonprofitSoftwareRegionSection[];
  metroHighlights: NonprofitSoftwareCityItem[];
  metroOverflowCount: number;
  cityStateSections: NonprofitSoftwareCityStateSection[];
}

export const nonprofitSoftwareRegionCopy: Record<
  NonprofitSoftwareRegionSlug,
  NonprofitSoftwareRegionCopy
> = {
  northeast: {
    title: "Northeast",
    description: "Start here for dense markets and state filing rules.",
    nextStepLabel: "See Northeast states",
  },
  midwest: {
    title: "Midwest",
    description: "Start here for state grants and local funder patterns.",
    nextStepLabel: "See Midwest states",
  },
  south: {
    title: "South",
    description: "Start here for state grants, local funders, and filing rules.",
    nextStepLabel: "See South states",
  },
  west: {
    title: "West",
    description: "Start here for large metros and multi-state reporting.",
    nextStepLabel: "See West states",
  },
};

const REGION_ORDER: NonprofitSoftwareRegionSlug[] = ["northeast", "midwest", "south", "west"];
const METRO_HIGHLIGHT_LIMIT = 12;
const STATE_REGION_BY_CODE: Record<string, NonprofitSoftwareRegionSlug> = {
  CT: "northeast",
  ME: "northeast",
  MA: "northeast",
  NH: "northeast",
  NJ: "northeast",
  NY: "northeast",
  PA: "northeast",
  RI: "northeast",
  VT: "northeast",
  IL: "midwest",
  IN: "midwest",
  IA: "midwest",
  KS: "midwest",
  MI: "midwest",
  MN: "midwest",
  MO: "midwest",
  NE: "midwest",
  ND: "midwest",
  OH: "midwest",
  SD: "midwest",
  WI: "midwest",
  AL: "south",
  AR: "south",
  DC: "south",
  DE: "south",
  FL: "south",
  GA: "south",
  KY: "south",
  LA: "south",
  MD: "south",
  MS: "south",
  NC: "south",
  OK: "south",
  SC: "south",
  TN: "south",
  TX: "south",
  VA: "south",
  WV: "south",
  AK: "west",
  AZ: "west",
  CA: "west",
  CO: "west",
  HI: "west",
  ID: "west",
  MT: "west",
  NV: "west",
  NM: "west",
  OR: "west",
  UT: "west",
  WA: "west",
  WY: "west",
};

function getRegion(stateCode: string): NonprofitSoftwareRegionSlug {
  return STATE_REGION_BY_CODE[stateCode] ?? "south";
}

function cityCountForRegion(
  cities: NonprofitSoftwareCityItem[],
  region: NonprofitSoftwareRegionSlug,
): number {
  return cities.filter((city) => getRegion(city.stateCode) === region).length;
}

function cityStateKey(city: NonprofitSoftwareCityItem): string {
  return `${city.stateCode}:${city.state}`;
}

export function buildNonprofitSoftwareHubModel(options: {
  stateEntries: NonprofitSoftwareStateEntry[];
  cityEntries: NonprofitSoftwareCityEntry[];
  stateHrefBuilder: (entry: NonprofitSoftwareStateEntry) => string;
  cityHrefBuilder: (entry: NonprofitSoftwareCityEntry) => string;
}): NonprofitSoftwareHubModel {
  const states: NonprofitSoftwareStateItem[] = mapToContentItems(
    options.stateEntries,
    options.stateHrefBuilder,
  )
    .map((item, index) => {
      const source = options.stateEntries[index] as NonprofitSoftwareStateEntry;

      return {
        ...item,
        state: source.data.state,
        stateCode: source.data.stateCode,
        establishmentCount: source.data.establishmentCount ?? 0,
      };
    })
    .sort((a, b) => a.state.localeCompare(b.state));

  const cities: NonprofitSoftwareCityItem[] = mapToContentItems(
    options.cityEntries,
    options.cityHrefBuilder,
  )
    .map((item, index) => {
      const source = options.cityEntries[index] as NonprofitSoftwareCityEntry;

      return {
        ...item,
        city: source.data.city,
        state: source.data.state,
        stateCode: source.data.stateCode,
        stateSlug: source.data.stateSlug,
        nonprofitCount: source.data.nonprofitCount ?? 0,
      };
    })
    .sort((a, b) => a.city.localeCompare(b.city));

  const regionSections = REGION_ORDER.map((slug): NonprofitSoftwareRegionSection => {
    const regionStates = states.filter((state) => getRegion(state.stateCode) === slug);
    const totalNonprofitCount = regionStates.reduce(
      (total, state) => total + state.establishmentCount,
      0,
    );

    return {
      slug,
      ...nonprofitSoftwareRegionCopy[slug],
      states: regionStates,
      stateCount: regionStates.length,
      cityCount: cityCountForRegion(cities, slug),
      totalNonprofitCount,
    };
  }).filter((section) => section.stateCount > 0);

  const metroHighlights = [...cities]
    .sort((a, b) => b.nonprofitCount - a.nonprofitCount || a.city.localeCompare(b.city))
    .slice(0, METRO_HIGHLIGHT_LIMIT);

  const stateHrefByCode = new Map(states.map((state) => [state.stateCode, state.href]));
  const citiesByState = new Map<string, NonprofitSoftwareCityItem[]>();

  for (const city of cities) {
    const key = cityStateKey(city);
    citiesByState.set(key, [...(citiesByState.get(key) ?? []), city]);
  }

  const cityStateSections = [...citiesByState.entries()]
    .map(([key, stateCities]): NonprofitSoftwareCityStateSection => {
      const [stateCode = "", state = ""] = key.split(":");
      const firstCity = stateCities[0] as NonprofitSoftwareCityItem;

      return {
        state,
        stateCode,
        href: stateHrefByCode.get(stateCode) ?? `/nonprofit-software/${firstCity.stateSlug}`,
        cities: stateCities.sort((a, b) => a.city.localeCompare(b.city)),
      };
    })
    .sort((a, b) => a.state.localeCompare(b.state));

  return {
    states,
    cities,
    regionSections,
    metroHighlights,
    metroOverflowCount: Math.max(0, cities.length - METRO_HIGHLIGHT_LIMIT),
    cityStateSections,
  };
}
