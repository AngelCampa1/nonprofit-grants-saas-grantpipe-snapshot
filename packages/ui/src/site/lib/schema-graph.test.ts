import { describe, it, expect } from "vitest";
import { buildGraph, withId, refId, buildSitewideSchemas } from "./schema-graph";

describe("buildGraph", () => {
  it("wraps schemas in @context and @graph", () => {
    const schema = { "@type": "Article", name: "Test" };
    const result = buildGraph([schema]);
    expect(result["@context"]).toBe("https://schema.org");
    expect(Array.isArray(result["@graph"])).toBe(true);
  });

  it("strips @context from each schema item", () => {
    const schema = {
      "@context": "https://schema.org",
      "@type": "Article",
      name: "Test",
    };
    const result = buildGraph([schema]);
    const graph = result["@graph"] as Record<string, unknown>[];
    expect(graph[0]).not.toHaveProperty("@context");
    expect(graph[0]["@type"]).toBe("Article");
    expect(graph[0]["name"]).toBe("Test");
  });

  it("strips @context from multiple schemas", () => {
    const schemas = [
      { "@context": "https://schema.org", "@type": "Article", name: "A" },
      { "@context": "https://schema.org", "@type": "Person", name: "B" },
    ];
    const result = buildGraph(schemas);
    const graph = result["@graph"] as Record<string, unknown>[];
    expect(graph).toHaveLength(2);
    expect(graph[0]).not.toHaveProperty("@context");
    expect(graph[1]).not.toHaveProperty("@context");
    expect(graph[0]["@type"]).toBe("Article");
    expect(graph[1]["@type"]).toBe("Person");
  });

  it("throws when passed an empty array", () => {
    expect(() => buildGraph([])).toThrow("buildGraph: schemas array must not be empty");
  });

  it("passes through schemas that have no @context", () => {
    const schema = { "@type": "Organization", name: "Acme" };
    const result = buildGraph([schema]);
    const graph = result["@graph"] as Record<string, unknown>[];
    expect(graph[0]).toEqual({ "@type": "Organization", name: "Acme" });
  });

  it("preserves existing @id on schemas", () => {
    const schema = {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": "https://example.com/#website",
    };
    const result = buildGraph([schema]);
    const graph = result["@graph"] as Record<string, unknown>[];
    expect(graph[0]["@id"]).toBe("https://example.com/#website");
    expect(graph[0]).not.toHaveProperty("@context");
  });

  it("does not mutate the input schemas", () => {
    const schema = {
      "@context": "https://schema.org",
      "@type": "Article",
      name: "Original",
    };
    buildGraph([schema]);
    expect(schema["@context"]).toBe("https://schema.org");
  });

  it("returns an object with exactly @context and @graph keys at root", () => {
    const result = buildGraph([{ "@type": "Thing" }]);
    const keys = Object.keys(result);
    expect(keys).toContain("@context");
    expect(keys).toContain("@graph");
    expect(keys).toHaveLength(2);
  });
});

describe("withId", () => {
  it("returns a new object with @id added", () => {
    const schema = { "@type": "Article", name: "Test" };
    const result = withId(schema, "https://example.com/#article");
    expect(result["@id"]).toBe("https://example.com/#article");
    expect(result["@type"]).toBe("Article");
    expect(result["name"]).toBe("Test");
  });

  it("does not mutate the original schema", () => {
    const schema: Record<string, unknown> = { "@type": "Article" };
    withId(schema, "https://example.com/#article");
    expect(schema).not.toHaveProperty("@id");
  });

  it("overwrites @id if already present", () => {
    const schema = { "@type": "Article", "@id": "https://example.com/#old" };
    const result = withId(schema, "https://example.com/#new");
    expect(result["@id"]).toBe("https://example.com/#new");
  });

  it("preserves all other properties", () => {
    const schema = {
      "@type": "Person",
      name: "Jane",
      url: "https://example.com/jane",
    };
    const result = withId(schema, "https://example.com/#jane");
    expect(result).toMatchObject(schema);
    expect(result["@id"]).toBe("https://example.com/#jane");
  });
});

describe("refId", () => {
  it("returns an object with @id property", () => {
    const result = refId("https://example.com/#article");
    expect(result).toEqual({ "@id": "https://example.com/#article" });
  });

  it("returns only the @id key", () => {
    const result = refId("https://example.com/#org");
    expect(Object.keys(result)).toHaveLength(1);
    expect(result["@id"]).toBe("https://example.com/#org");
  });
});

describe("buildSitewideSchemas", () => {
  const baseOpts = {
    siteName: "GrantPipe",
    siteUrl: "https://grantpipe.com",
  };

  it("returns an array with exactly two nodes: Organization and WebSite", () => {
    const result = buildSitewideSchemas(baseOpts);
    expect(result).toHaveLength(2);
  });

  it("Organization node has required @type", () => {
    const [org] = buildSitewideSchemas(baseOpts);
    expect(org["@type"]).toBe("Organization");
  });

  it("Organization node has required name", () => {
    const [org] = buildSitewideSchemas(baseOpts);
    expect(org["name"]).toBe("GrantPipe");
  });

  it("Organization node has required url", () => {
    const [org] = buildSitewideSchemas(baseOpts);
    expect(org["url"]).toBe("https://grantpipe.com");
  });

  it("Organization node has @id set to siteUrl/#organization", () => {
    const [org] = buildSitewideSchemas(baseOpts);
    expect(org["@id"]).toBe("https://grantpipe.com/#organization");
  });

  it("Organization node has logo when logoUrl is provided", () => {
    const [org] = buildSitewideSchemas({
      ...baseOpts,
      logoUrl: "https://grantpipe.com/logo.svg",
    });
    const logo = org["logo"] as Record<string, unknown>;
    expect(logo["@type"]).toBe("ImageObject");
    expect(logo["url"]).toBe("https://grantpipe.com/logo.svg");
  });

  it("Organization node omits logo when logoUrl is not provided", () => {
    const [org] = buildSitewideSchemas(baseOpts);
    expect(org["logo"]).toBeUndefined();
  });

  it("Organization node includes sameAs links when provided", () => {
    const [org] = buildSitewideSchemas({
      ...baseOpts,
      sameAs: ["https://www.linkedin.com/company/grantpipe/"],
    });

    expect(org["sameAs"]).toEqual(["https://www.linkedin.com/company/grantpipe/"]);
  });

  it("Organization node includes founder metadata when provided", () => {
    const [org] = buildSitewideSchemas({
      ...baseOpts,
      founder: {
        name: "Angel Campa",
        url: "https://grantpipe.com/about/",
        jobTitle: "Founder & Principal SDET",
        sameAs: ["https://www.linkedin.com/in/angelcampa1/"],
      },
    });

    const founder = org["founder"] as Record<string, unknown>;
    expect(founder["@type"]).toBe("Person");
    expect(founder["name"]).toBe("Angel Campa");
    expect(founder["url"]).toBe("https://grantpipe.com/about/");
    expect(founder["jobTitle"]).toBe("Founder & Principal SDET");
    expect(founder["sameAs"]).toEqual(["https://www.linkedin.com/in/angelcampa1/"]);
  });

  it("Organization node includes founder credentials when provided", () => {
    const [org] = buildSitewideSchemas({
      ...baseOpts,
      founder: {
        name: "Angel Campa",
        credentials: ["Principal SDET"],
      },
    });

    const founder = org["founder"] as Record<string, unknown>;
    expect(founder["hasCredential"]).toEqual(["Principal SDET"]);
  });

  it("WebSite node has required @type", () => {
    const [, website] = buildSitewideSchemas(baseOpts);
    expect(website["@type"]).toBe("WebSite");
  });

  it("WebSite node has required name", () => {
    const [, website] = buildSitewideSchemas(baseOpts);
    expect(website["name"]).toBe("GrantPipe");
  });

  it("WebSite node has required url", () => {
    const [, website] = buildSitewideSchemas(baseOpts);
    expect(website["url"]).toBe("https://grantpipe.com");
  });

  it("WebSite node has @id set to siteUrl/#website", () => {
    const [, website] = buildSitewideSchemas(baseOpts);
    expect(website["@id"]).toBe("https://grantpipe.com/#website");
  });

  it("WebSite node references Organization via publisher @id", () => {
    const [, website] = buildSitewideSchemas(baseOpts);
    const publisher = website["publisher"] as Record<string, unknown>;
    expect(publisher["@id"]).toBe("https://grantpipe.com/#organization");
  });

  it("both nodes merge correctly into a @graph array via buildGraph", () => {
    const schemas = buildSitewideSchemas(baseOpts);
    const graph = buildGraph(schemas);
    expect(graph["@context"]).toBe("https://schema.org");
    const graphArr = graph["@graph"] as Record<string, unknown>[];
    expect(graphArr).toHaveLength(2);
    const types = graphArr.map((n) => n["@type"]);
    expect(types).toContain("Organization");
    expect(types).toContain("WebSite");
  });

  it("nodes returned are plain objects (no @context to strip)", () => {
    const schemas = buildSitewideSchemas(baseOpts);
    for (const schema of schemas) {
      expect(schema).not.toHaveProperty("@context");
    }
  });
});
