import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(__dirname, "./content-card.astro"), "utf8");

describe("content card source", () => {
  it("marks resource cards with stable analytics attributes", () => {
    expect(source).toContain("data-resource-card");
    expect(source).toContain("data-resource-card-id");
    expect(source).toContain("data-resource-card-family");
    expect(source).toContain("data-resource-card-stage");
    expect(source).toContain("data-resource-card-featured");
  });

  it("does not use raw card title or description as the analytics id", () => {
    expect(source).toContain("resourceCardPath");
    expect(source).toContain('new URL(item.href, "https://grantpipe.com").pathname');
    expect(source).toContain("item.href.split(/[?#]/, 1)[0]");
    expect(source).not.toContain("data-resource-card-id={item.title}");
    expect(source).not.toContain("data-resource-card-id={item.description}");
  });
});
