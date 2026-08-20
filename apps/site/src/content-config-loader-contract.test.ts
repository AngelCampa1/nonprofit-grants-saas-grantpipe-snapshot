import { describe, expect, it, vi } from "vitest";
import { getMarketingContentCollectionBase } from "@grantpipe/shared/public-kb";
import { collections } from "./content.config";

vi.mock("astro:content", async () => {
  const { z } = await import("zod");
  return {
    defineCollection: (config: unknown) => config,
    z,
  };
});

vi.mock("astro/loaders", () => ({
  glob: (options: unknown) => ({ loader: "glob", options }),
}));

const COLLECTION_DIRS = [
  "alternatives",
  "benchmarks",
  "comparisons",
  "faq-hubs",
  "pricing-breakdowns",
  "listicles",
  "guides",
  "state-pages",
  "city-pages",
  "vertical-pages",
  "lead-magnets",
  "personas",
  "workflows",
  "glossary",
  "features",
  "integrations",
] as const;

type MockedCollection = {
  loader: {
    loader: "glob";
    options: {
      pattern: string;
      base: string;
    };
  };
};

describe("content collection loader contract", () => {
  it("registers every markdown collection", () => {
    expect(Object.keys(collections).sort()).toEqual([...COLLECTION_DIRS].sort());
  });

  it("uses explicit glob loaders for every markdown content directory", () => {
    const typedCollections = collections as unknown as Record<string, MockedCollection>;

    for (const dir of COLLECTION_DIRS) {
      expect(typedCollections[dir]?.loader).toEqual({
        loader: "glob",
        options: {
          pattern: "**/*.md",
          base: getMarketingContentCollectionBase(dir),
        },
      });
    }
  });
});
