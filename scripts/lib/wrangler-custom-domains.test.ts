import { describe, expect, it } from "vitest";
import { extractWorkerRoutes, mergeWorkerRoutes } from "./wrangler-custom-domains";

describe("extractWorkerRoutes", () => {
  it("returns an empty array when routes key is absent", () => {
    expect(extractWorkerRoutes({})).toEqual([]);
  });

  it("returns an empty array when routes is not an array", () => {
    expect(extractWorkerRoutes({ routes: "grantpipe.com/*" })).toEqual([]);
  });

  it("filters out entries missing both zone_name and zone_id", () => {
    expect(
      extractWorkerRoutes({
        routes: [
          { pattern: "grantpipe.com/*", zone_name: "grantpipe.com" },
          { pattern: "missing-zone" },
          { zone_name: "grantpipe.com" },
          null,
          42,
        ],
      }),
    ).toEqual([{ pattern: "grantpipe.com/*", zone_name: "grantpipe.com" }]);
  });

  it("accepts entries with zone_id instead of zone_name", () => {
    expect(
      extractWorkerRoutes({
        routes: [{ pattern: "grantpipe.com/*", zone_id: "abc123" }],
      }),
    ).toEqual([{ pattern: "grantpipe.com/*", zone_id: "abc123" }]);
  });

  it("accepts custom-domain route entries without zone identifiers", () => {
    expect(
      extractWorkerRoutes({
        routes: [{ pattern: "grantpipe.com", custom_domain: true }],
      }),
    ).toEqual([{ pattern: "grantpipe.com", custom_domain: true }]);
  });

  it("returns all valid route entries", () => {
    expect(
      extractWorkerRoutes({
        routes: [
          { pattern: "grantpipe.com/*", zone_name: "grantpipe.com" },
          { pattern: "www.grantpipe.com/*", zone_name: "grantpipe.com" },
        ],
      }),
    ).toEqual([
      { pattern: "grantpipe.com/*", zone_name: "grantpipe.com" },
      { pattern: "www.grantpipe.com/*", zone_name: "grantpipe.com" },
    ]);
  });
});

describe("mergeWorkerRoutes", () => {
  it("returns the original config unchanged when routes list is empty", () => {
    const config = { name: "grantpipe-site" };
    expect(mergeWorkerRoutes(config, [])).toBe(config);
  });

  it("injects routes into the generated config", () => {
    expect(
      mergeWorkerRoutes({ name: "grantpipe-site" }, [
        { pattern: "grantpipe.com/*", zone_name: "grantpipe.com" },
        { pattern: "www.grantpipe.com/*", zone_name: "grantpipe.com" },
      ]),
    ).toEqual({
      name: "grantpipe-site",
      routes: [
        { pattern: "grantpipe.com/*", zone_name: "grantpipe.com" },
        { pattern: "www.grantpipe.com/*", zone_name: "grantpipe.com" },
      ],
    });
  });

  it("overwrites any existing routes in the generated config", () => {
    expect(
      mergeWorkerRoutes(
        {
          name: "grantpipe-site",
          routes: [{ pattern: "old.example/*", zone_name: "example.com" }],
        },
        [{ pattern: "grantpipe.com/*", zone_name: "grantpipe.com" }],
      ),
    ).toEqual({
      name: "grantpipe-site",
      routes: [{ pattern: "grantpipe.com/*", zone_name: "grantpipe.com" }],
    });
  });
});
