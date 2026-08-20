import { describe, expect, it } from "vitest";

import * as site from "./index";

describe("site index barrel", () => {
  it("re-exports core site components and utilities", () => {
    expect(site.EmailCapture).toBeTypeOf("function");
    expect(site.FakeDoorPricing).toBeTypeOf("function");
    expect(site.cn).toBeTypeOf("function");
    expect(site.buildGraph).toBeTypeOf("function");
    expect(site.createSitemapSerializer).toBeTypeOf("function");
  });
});
