import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(process.cwd(), "src/site/hubs/category-hub.astro"), "utf8");

describe("CategoryHub SEO source contract", () => {
  it("marks paginated hub pages noindex while preserving follow", () => {
    expect(source).toContain("noindex={page.currentPage > 1}");
  });
});

describe("CategoryHub empty-state prop contract", () => {
  it("does not ship a 'More content coming soon' default for emptyStateHeading", () => {
    expect(source).not.toContain("More content coming soon");
  });

  it("does not ship a 'we'll let you know when we publish' default for emptyStateBody", () => {
    expect(source).not.toContain("we'll let you know when we publish");
  });

  it("requires emptyStateHeading and emptyStateBody at the TypeScript Props level", () => {
    expect(source).toMatch(/emptyStateHeading:\s*string/);
    expect(source).toMatch(/emptyStateBody:\s*string/);
    expect(source).not.toMatch(/emptyStateHeading\?:\s*string/);
    expect(source).not.toMatch(/emptyStateBody\?:\s*string/);
  });
});

describe("CategoryHub custom body contract", () => {
  it("can hide the default listing for grouped hub bodies", () => {
    expect(source).toMatch(/renderListing\?:\s*boolean/);
    expect(source).toContain("renderListing = true");
    expect(source).toContain("renderListing &&");
  });
});
