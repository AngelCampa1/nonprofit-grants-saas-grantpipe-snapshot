import { describe, it, expect } from "vitest";
import { getAffectedPackages } from "./affected-packages";

describe("getAffectedPackages", () => {
  it("returns empty array when no files are staged", () => {
    const result = getAffectedPackages([]);
    expect(result).toEqual([]);
  });

  it("detects apps/api changes", () => {
    const result = getAffectedPackages(["apps/api/src/app.ts"]);
    expect(result).toContain("@grantpipe/api");
  });

  it("detects apps/web changes", () => {
    const result = getAffectedPackages(["apps/web/src/main.tsx"]);
    expect(result).toContain("@grantpipe/web");
  });

  it("detects packages/shared changes and downstream consumers", () => {
    const result = getAffectedPackages(["packages/shared/src/types/index.ts"]);
    expect(result).toEqual([
      "@grantpipe/shared",
      "@grantpipe/api",
      "@grantpipe/web",
      "@grantpipe/site",
    ]);
  });

  it("detects packages/db changes and the API consumer", () => {
    const result = getAffectedPackages(["packages/db/src/schema/index.ts"]);
    expect(result).toEqual(["@grantpipe/db", "@grantpipe/api"]);
  });

  it("detects packages/ui changes and frontend consumers", () => {
    const result = getAffectedPackages(["packages/ui/src/globals.css"]);
    expect(result).toEqual(["@grantpipe/ui", "@grantpipe/web", "@grantpipe/site"]);
  });

  it("deduplicates packages", () => {
    const result = getAffectedPackages([
      "apps/api/src/app.ts",
      "apps/api/src/domains/health/routes.ts",
    ]);
    expect(result).toEqual(["@grantpipe/api"]);
  });

  it("ignores files outside packages", () => {
    const result = getAffectedPackages(["README.md", ".gitignore"]);
    expect(result).toEqual([]);
  });

  it("runs every package for root build and test config changes", () => {
    const result = getAffectedPackages(["scripts/vitest.config.ts"]);
    expect(result).toEqual([
      "@grantpipe/shared",
      "@grantpipe/db",
      "@grantpipe/ui",
      "@grantpipe/api",
      "@grantpipe/web",
      "@grantpipe/site",
    ]);
  });
});
