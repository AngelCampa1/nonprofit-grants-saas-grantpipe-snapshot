import { describe, it, expect } from "vitest";
import { Compass } from "lucide-react";

import { buildDestinations, type Destination } from "./destinations";
import { navSections, type NavSection } from "./nav";

describe("buildDestinations", () => {
  const destinations = buildDestinations();

  it("returns a non-empty array", () => {
    expect(Array.isArray(destinations)).toBe(true);
    expect(destinations.length).toBeGreaterThan(0);
  });

  it("every destination has a to, label, and group", () => {
    for (const destination of destinations) {
      expect(typeof destination.to).toBe("string");
      expect(destination.to.length).toBeGreaterThan(0);
      expect(typeof destination.label).toBe("string");
      expect(destination.label.length).toBeGreaterThan(0);
      expect(typeof destination.group).toBe("string");
      expect(destination.group.length).toBeGreaterThan(0);
    }
  });

  it("dedupes by `to` — every route appears exactly once", () => {
    const routes = destinations.map((d) => d.to);
    expect(new Set(routes).size).toBe(routes.length);
  });

  it("first occurrence wins on dedupe — nav rows take precedence over same-route tabs", () => {
    // /donors is both a nav row (label "Donors") and the donorTabs "Overview"
    // entry — the nav row must win since it's unioned first.
    const donors = destinations.find((d) => d.to === "/donors");
    expect(donors?.label).toBe("Donors");
    expect(donors?.group).toBe("Fundraising");

    // /accounting is both the single Accounting nav row and the
    // ACCOUNTING_SECTIONS "Overview" entry — the nav row wins.
    const accounting = destinations.find((d) => d.to === "/accounting");
    expect(accounting?.label).toBe("Accounting");
    expect(accounting?.group).toBe("Accounting");
  });

  it("skips tab items labeled 'Overview' since their parent nav row already covers the route", () => {
    const overviewLabeled = destinations.filter((d) => d.label === "Overview");
    expect(overviewLabeled).toHaveLength(0);
  });

  describe("removed top-level pages stay searchable exactly once", () => {
    const removedRoutes = [
      "/donors/at-risk",
      "/donors/pledges",
      "/donors/email",
      "/funders",
      "/subrecipients",
      "/grants/pipeline",
      "/grants/sentinel",
      "/programs",
      "/reports/builder",
      "/reports/drafts",
      "/reports/ask-ledger",
      "/evidence-bundles",
      "/deadlines/calendar",
      "/settings/entities",
      "/accounting/chart-of-accounts",
      "/accounting/journal",
      "/accounting/ledger",
      "/accounting/trial-balance",
      "/accounting/periods",
      "/accounting/recurring",
      "/accounting/reports/financial-position",
      "/accounting/reports/activities",
      "/accounting/reports/functional-expenses",
      "/accounting/bank",
      "/accounting/integrations",
      "/accounting/anomalies",
      "/accounting/studios/functional-expense-allocation",
    ];

    it.each(removedRoutes)("includes %s exactly once", (route) => {
      const matches = destinations.filter((d) => d.to === route);
      expect(matches).toHaveLength(1);
    });

    it("covers all 13 accounting sub-routes", () => {
      const accountingSubRoutes = destinations.filter(
        (d) => d.to.startsWith("/accounting") && d.to !== "/accounting",
      );
      expect(accountingSubRoutes).toHaveLength(13);
      for (const route of accountingSubRoutes) {
        expect(route.group).toBe("Accounting");
      }
    });
  });

  describe("group assignment", () => {
    it("assigns nav-row destinations the section label as group", () => {
      const dashboard = destinations.find((d) => d.to === "/dashboard");
      expect(dashboard?.group).toBe("General");

      const grants = destinations.find((d) => d.to === "/grants");
      expect(grants?.group).toBe("Grants & Funding");

      const help = destinations.find((d) => d.to === "/help");
      expect(help?.group).toBe("Workspace");
    });

    it("assigns tab-derived destinations their tab group name", () => {
      const atRisk = destinations.find((d) => d.to === "/donors/at-risk");
      expect(atRisk?.group).toBe("Donors");

      const pipeline = destinations.find((d) => d.to === "/grants/pipeline");
      expect(pipeline?.group).toBe("Grants");

      const programs = destinations.find((d) => d.to === "/programs");
      expect(programs?.group).toBe("Funds");

      const builder = destinations.find((d) => d.to === "/reports/builder");
      expect(builder?.group).toBe("Reports");

      const calendar = destinations.find((d) => d.to === "/deadlines/calendar");
      expect(calendar?.group).toBe("Deadlines");
    });

    it("assigns accounting sub-route destinations group 'Accounting'", () => {
      const journal = destinations.find((d) => d.to === "/accounting/journal");
      expect(journal?.group).toBe("Accounting");
    });

    it("assigns the standalone Entities extra destination group 'Workspace'", () => {
      const entities = destinations.find((d) => d.to === "/settings/entities");
      expect(entities?.label).toBe("Entities");
      expect(entities?.group).toBe("Workspace");
      expect(entities?.roles).toEqual(["admin"]);
    });
  });

  it("accepts a custom sections argument and still unions tabs/accounting/extras", () => {
    const custom: NavSection[] = [
      {
        label: "Custom",
        items: [
          {
            to: "/custom-page",
            label: "Custom Page",
            navItemId: "custom-page",
            icon: () => null,
          },
        ],
      },
    ];
    const result = buildDestinations(custom);
    expect(result.find((d) => d.to === "/custom-page")).toMatchObject({
      label: "Custom Page",
      group: "Custom",
    });
    // Tabs/accounting/extras are still unioned regardless of the sections arg
    expect(result.find((d) => d.to === "/donors/at-risk")).toBeDefined();
    expect(result.find((d) => d.to === "/settings/entities")).toBeDefined();
  });

  it("defaults to the live navSections when no argument is passed", () => {
    const defaultResult = buildDestinations();
    const explicitResult = buildDestinations(navSections);
    expect(defaultResult.map((d) => d.to)).toEqual(explicitResult.map((d) => d.to));
  });

  it("preserves feature/minimumPermission/requiredPermissions/roles from the source entry", () => {
    const donorEmail = destinations.find((d) => d.to === "/donors/email");
    expect(donorEmail).toMatchObject({
      feature: "donors",
      minimumPermission: "edit",
    });

    const askLedger = destinations.find((d) => d.to === "/reports/ask-ledger");
    expect(askLedger?.requiredPermissions).toEqual([
      { feature: "reports", minimumPermission: "view" },
      { feature: "accounting", minimumPermission: "view" },
    ]);

    const entities = destinations.find((d) => d.to === "/settings/entities");
    expect(entities?.roles).toEqual(["admin"]);
  });

  it("type export Destination is usable for annotations", () => {
    const sample: Destination = { to: "/x", label: "X", group: "General", icon: () => null };
    expect(sample.to).toBe("/x");
  });

  describe("icons", () => {
    const iconOf = (to: string) => destinations.find((d) => d.to === to)?.icon;

    it("every destination carries an icon", () => {
      for (const destination of destinations) {
        // Lucide icons are forwardRef exotic objects, custom icons are plain
        // functions — either way the field must be present and renderable.
        expect(destination.icon).toBeTruthy();
        expect(["function", "object"]).toContain(typeof destination.icon);
      }
    });

    it("nav-row destinations keep their own sidebar icon", () => {
      const donorsNavItem = navSections
        .flatMap((section) => section.items)
        .find((item) => item.to === "/donors");
      expect(iconOf("/donors")).toBe(donorsNavItem?.icon);
    });

    it("tab-derived destinations inherit their group's sidebar-row icon", () => {
      expect(iconOf("/donors/at-risk")).toBe(iconOf("/donors"));
      expect(iconOf("/donors/pledges")).toBe(iconOf("/donors"));
      expect(iconOf("/funders")).toBe(iconOf("/grants"));
      expect(iconOf("/grants/sentinel")).toBe(iconOf("/grants"));
      expect(iconOf("/programs")).toBe(iconOf("/funds"));
      expect(iconOf("/reports/ask-ledger")).toBe(iconOf("/reports"));
      expect(iconOf("/deadlines/calendar")).toBe(iconOf("/deadlines"));
    });

    it("accounting sub-route destinations inherit the Accounting sidebar icon", () => {
      expect(iconOf("/accounting/journal")).toBe(iconOf("/accounting"));
      expect(iconOf("/accounting/integrations")).toBe(iconOf("/accounting"));
    });

    it("the Entities extra inherits the Settings sidebar icon", () => {
      expect(iconOf("/settings/entities")).toBe(iconOf("/settings"));
    });

    it("falls back to the Compass icon when no sidebar anchor row exists", () => {
      const result = buildDestinations([]);
      const atRisk = result.find((d) => d.to === "/donors/at-risk");
      const journal = result.find((d) => d.to === "/accounting/journal");
      const entities = result.find((d) => d.to === "/settings/entities");
      expect(atRisk?.icon).toBe(Compass);
      expect(journal?.icon).toBe(Compass);
      expect(entities?.icon).toBe(Compass);
    });
  });
});
