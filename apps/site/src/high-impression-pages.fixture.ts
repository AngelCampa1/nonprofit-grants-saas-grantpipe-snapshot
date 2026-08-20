export type HighImpressionPage = {
  collection: "guides" | "comparisons" | "pricing-breakdowns" | "lead-magnets" | "state-pages";
  slug: string;
  source: "gsc-search-analytics";
  date: string;
  impressions: number;
  clicks: number;
  ctr: number;
  position: number;
};

export const highImpressionPages: HighImpressionPage[] = [
  {
    collection: "guides",
    slug: "nonprofit-crm-pricing-guide",
    source: "gsc-search-analytics",
    date: "2026-05-20",
    impressions: 8088,
    clicks: 1,
    ctr: 0.0001,
    position: 9.2,
  },
  {
    collection: "guides",
    slug: "salesforce-nonprofit-cost",
    source: "gsc-search-analytics",
    date: "2026-05-20",
    impressions: 1927,
    clicks: 1,
    ctr: 0.0005,
    position: 7.5,
  },
  {
    collection: "comparisons",
    slug: "salesforce-nonprofit-vs-blackbaud",
    source: "gsc-search-analytics",
    date: "2026-05-20",
    impressions: 1478,
    clicks: 1,
    ctr: 0.0007,
    position: 12.9,
  },
  {
    collection: "pricing-breakdowns",
    slug: "bloomerang-pricing",
    source: "gsc-search-analytics",
    date: "2026-05-20",
    impressions: 1719,
    clicks: 5,
    ctr: 0.0029,
    position: 7.3,
  },
  {
    collection: "guides",
    slug: "federal-procurement-thresholds-micro-small-large",
    source: "gsc-search-analytics",
    date: "2026-05-20",
    impressions: 1510,
    clicks: 2,
    ctr: 0.0013,
    position: 8.7,
  },
  {
    collection: "pricing-breakdowns",
    slug: "salesforce-nonprofit-pricing",
    source: "gsc-search-analytics",
    date: "2026-05-20",
    impressions: 70,
    clicks: 0,
    ctr: 0,
    position: 13.4,
  },
  {
    collection: "pricing-breakdowns",
    slug: "blackbaud-pricing",
    source: "gsc-search-analytics",
    date: "2026-05-20",
    impressions: 1135,
    clicks: 1,
    ctr: 0.0009,
    position: 7.3,
  },
  {
    collection: "comparisons",
    slug: "blackbaud-vs-bloomerang",
    source: "gsc-search-analytics",
    date: "2026-05-20",
    impressions: 1037,
    clicks: 1,
    ctr: 0.001,
    position: 8.8,
  },
  {
    collection: "comparisons",
    slug: "givebutter-vs-bloomerang",
    source: "gsc-search-analytics",
    date: "2026-05-20",
    impressions: 705,
    clicks: 1,
    ctr: 0.0014,
    position: 10.1,
  },
  {
    collection: "comparisons",
    slug: "bloomerang-vs-little-green-light",
    source: "gsc-search-analytics",
    date: "2026-05-20",
    impressions: 205,
    clicks: 0,
    ctr: 0,
    position: 15.6,
  },
];
