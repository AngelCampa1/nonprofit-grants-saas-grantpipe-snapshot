import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { appKnowledge } from "@grantpipe/shared/knowledge";
import { isNavItemVisible, type AppRole } from "../config/nav";
import { buildDestinations } from "../config/destinations";
import { HELP_ARTICLES } from "./help-content";

describe("help content knowledge base contract", () => {
  it("renders help articles from canonical app knowledge", () => {
    expect(HELP_ARTICLES).toBe(appKnowledge.helpArticles);
  });

  it("keeps authenticated help imports on the internal knowledge facade", () => {
    const helpContentSource = readFileSync(
      resolve(process.cwd(), "src/lib/help-content.ts"),
      "utf8",
    );
    const helpRouteSource = readFileSync(
      resolve(process.cwd(), "src/routes/_authenticated/help.tsx"),
      "utf8",
    );

    expect(helpContentSource).toContain("@grantpipe/shared/knowledge");
    expect(helpContentSource).not.toContain('from "@grantpipe/shared"');
    expect(helpRouteSource).toContain("@grantpipe/shared/knowledge");
    expect(helpRouteSource).not.toContain("@grantpipe/shared/public-kb");
  });

  it("keeps canonical app knowledge routes aligned with shipped navigation", () => {
    // Shipped navigation = the destinations registry: sidebar rows plus in-page
    // tabs and the accounting module nav (the consolidated sidebar no longer
    // carries a row per page).
    const destinations = new Map(buildDestinations().map((dest) => [dest.to, dest]));
    const roles: AppRole[] = ["admin", "editor", "viewer", "auditor"];

    for (const route of appKnowledge.routes) {
      const destination = destinations.get(route.path);
      const visibleRoles = roles.filter(
        (role) => destination !== undefined && isNavItemVisible(destination, role, null),
      );

      expect(destination?.label, route.path).toBe(route.label);
      expect(visibleRoles, route.path).toEqual([...route.roles]);
    }
  });
});
