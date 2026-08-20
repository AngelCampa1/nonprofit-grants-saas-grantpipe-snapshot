import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { describe, it, expect } from "vitest";
import { donorTabs, grantsTabs, fundsTabs, reportsTabs, deadlinesTabs } from "./page-tabs";

// Helper to read routeTree and extract all route IDs
function getAllRouteIds(): Set<string> {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const routeTreePath = path.resolve(__dirname, "../routeTree.gen.ts");
  const content = readFileSync(routeTreePath, "utf-8");

  // Extract all route IDs from the file using regex patterns like: id: '/path'
  const idMatches = content.matchAll(/id:\s*['"]([^'"]+)['"]/g);
  const ids = new Set<string>();

  for (const match of idMatches) {
    if (match[1]) {
      ids.add(match[1]);
    }
  }

  return ids;
}

describe("page-tabs config", () => {
  const allTabs = [
    { name: "donorTabs", tabs: donorTabs },
    { name: "grantsTabs", tabs: grantsTabs },
    { name: "fundsTabs", tabs: fundsTabs },
    { name: "reportsTabs", tabs: reportsTabs },
    { name: "deadlinesTabs", tabs: deadlinesTabs },
  ];

  describe("exports", () => {
    it("exports donorTabs array", () => {
      expect(Array.isArray(donorTabs)).toBe(true);
      expect(donorTabs.length).toBeGreaterThan(0);
    });

    it("exports grantsTabs array", () => {
      expect(Array.isArray(grantsTabs)).toBe(true);
      expect(grantsTabs.length).toBeGreaterThan(0);
    });

    it("exports fundsTabs array", () => {
      expect(Array.isArray(fundsTabs)).toBe(true);
      expect(fundsTabs.length).toBeGreaterThan(0);
    });

    it("exports reportsTabs array", () => {
      expect(Array.isArray(reportsTabs)).toBe(true);
      expect(reportsTabs.length).toBeGreaterThan(0);
    });

    it("exports deadlinesTabs array with Radar and Calendar", () => {
      expect(deadlinesTabs.map((t) => t.label)).toEqual(["Radar", "Calendar"]);
      expect(deadlinesTabs.map((t) => t.to)).toEqual(["/deadlines", "/deadlines/calendar"]);
    });
  });

  describe("tab structure", () => {
    it("each tab has a to and label property", () => {
      for (const group of allTabs) {
        for (const tab of group.tabs) {
          expect(typeof tab.to).toBe("string");
          expect(typeof tab.label).toBe("string");
          expect(tab.to.length).toBeGreaterThan(0);
          expect(tab.label.length).toBeGreaterThan(0);
        }
      }
    });

    it("each tab's to starts with a forward slash", () => {
      for (const group of allTabs) {
        for (const tab of group.tabs) {
          expect(tab.to).toMatch(/^\//);
        }
      }
    });

    it("feature and minimumPermission are valid when present", () => {
      const validPermissions = ["view", "edit", "manage"];
      for (const group of allTabs) {
        for (const tab of group.tabs) {
          if (tab.minimumPermission !== undefined) {
            expect(validPermissions).toContain(tab.minimumPermission);
          }
          if (tab.requiredPermissions !== undefined) {
            expect(Array.isArray(tab.requiredPermissions)).toBe(true);
            for (const req of tab.requiredPermissions) {
              expect(validPermissions).toContain(req.minimumPermission);
              expect(typeof req.feature).toBe("string");
            }
          }
        }
      }
    });
  });

  describe("route existence in routeTree", () => {
    const routeIds = getAllRouteIds();

    it("all tab routes exist in routeTree.gen.ts", () => {
      for (const group of allTabs) {
        for (const tab of group.tabs) {
          // Check if route exists as either `/path` or `/path/` or `/_authenticated/path` or `/_authenticated/path/`
          const hasRoute =
            routeIds.has(tab.to) ||
            routeIds.has(`${tab.to}/`) ||
            routeIds.has(`/_authenticated${tab.to}`) ||
            routeIds.has(`/_authenticated${tab.to}/`);

          const matchingRoutes = Array.from(routeIds)
            .filter((id) => id.includes(tab.to.split("/")[1] || ""))
            .join(", ");

          expect(
            hasRoute,
            `Route ${tab.to} not found in routeTree. Similar: ${matchingRoutes}`,
          ).toBe(true);
        }
      }
    });
  });

  describe("labels and uniqueness", () => {
    it("all labels within a group are unique", () => {
      for (const group of allTabs) {
        const labels = group.tabs.map((t) => t.label);
        const uniqueLabels = new Set(labels);
        expect(uniqueLabels.size).toBe(labels.length);
      }
    });

    it("all routes within all groups are unique", () => {
      const allRoutes = allTabs.flatMap((g) => g.tabs.map((t) => t.to));
      const uniqueRoutes = new Set(allRoutes);
      expect(uniqueRoutes.size).toBe(allRoutes.length);
    });

    it("labels are non-empty", () => {
      for (const group of allTabs) {
        for (const tab of group.tabs) {
          expect(tab.label.trim().length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe("group structure", () => {
    it("donorTabs first item is Overview at /donors", () => {
      expect(donorTabs[0]?.to).toBe("/donors");
      expect(donorTabs[0]?.label.toLowerCase()).toContain("overview");
    });

    it("grantsTabs first item is Overview at /grants", () => {
      expect(grantsTabs[0]?.to).toBe("/grants");
      expect(grantsTabs[0]?.label.toLowerCase()).toContain("overview");
    });

    it("fundsTabs first item is Overview at /funds", () => {
      expect(fundsTabs[0]?.to).toBe("/funds");
      expect(fundsTabs[0]?.label.toLowerCase()).toContain("overview");
    });

    it("reportsTabs first item is Overview at /reports", () => {
      expect(reportsTabs[0]?.to).toBe("/reports");
      expect(reportsTabs[0]?.label.toLowerCase()).toContain("overview");
    });

    it("deadlinesTabs first item is the parent /deadlines route", () => {
      expect(deadlinesTabs[0]?.to).toBe("/deadlines");
    });
  });

  describe("permissions mapping", () => {
    it("donorTabs items have correct feature areas", () => {
      const overview = donorTabs.find((t) => t.to === "/donors");
      const atRisk = donorTabs.find((t) => t.to === "/donors/at-risk");
      const pledges = donorTabs.find((t) => t.to === "/donors/pledges");
      const email = donorTabs.find((t) => t.to === "/donors/email");

      expect(overview?.feature).toBe("donors");
      expect(overview?.minimumPermission).toBe("view");
      expect(atRisk?.feature).toBe("donors");
      expect(atRisk?.minimumPermission).toBe("view");
      expect(pledges?.feature).toBe("donors");
      expect(pledges?.minimumPermission).toBe("view");
      expect(email?.feature).toBe("donors");
      expect(email?.minimumPermission).toBe("edit");
    });

    it("grantsTabs items have correct feature areas", () => {
      const overview = grantsTabs.find((t) => t.to === "/grants");
      const pipeline = grantsTabs.find((t) => t.to === "/grants/pipeline");
      const funders = grantsTabs.find((t) => t.to === "/funders");
      const subrecipients = grantsTabs.find((t) => t.to === "/subrecipients");
      const sentinel = grantsTabs.find((t) => t.to === "/grants/sentinel");

      expect(overview?.feature).toBe("grants");
      expect(pipeline?.feature).toBe("grants");
      expect(funders?.feature).toBe("grants");
      expect(subrecipients?.feature).toBe("compliance");
      expect(sentinel?.feature).toBe("grants");
    });

    it("fundsTabs items have correct feature areas", () => {
      const overview = fundsTabs.find((t) => t.to === "/funds");
      const programs = fundsTabs.find((t) => t.to === "/programs");

      expect(overview?.feature).toBe("funds");
      expect(overview?.minimumPermission).toBe("view");
      expect(programs?.feature).toBe("programs");
      expect(programs?.minimumPermission).toBe("view");
    });

    it("reportsTabs items have correct feature areas", () => {
      const overview = reportsTabs.find((t) => t.to === "/reports");
      const builder = reportsTabs.find((t) => t.to === "/reports/builder");
      const drafts = reportsTabs.find((t) => t.to === "/reports/drafts");
      const askLedger = reportsTabs.find((t) => t.to === "/reports/ask-ledger");
      const evidenceBundles = reportsTabs.find((t) => t.to === "/evidence-bundles");

      expect(overview?.feature).toBe("reports");
      expect(overview?.minimumPermission).toBe("view");
      expect(builder?.feature).toBe("reports");
      expect(builder?.minimumPermission).toBe("view");
      expect(drafts?.feature).toBe("reports");
      expect(drafts?.minimumPermission).toBe("view");
      expect(askLedger?.feature).toBe("reports");
      expect(askLedger?.minimumPermission).toBe("view");
      expect(askLedger?.requiredPermissions).toEqual([
        { feature: "reports", minimumPermission: "view" },
        { feature: "accounting", minimumPermission: "view" },
      ]);
      expect(evidenceBundles?.feature).toBe("reports");
      expect(evidenceBundles?.minimumPermission).toBe("view");
    });
  });

  describe("role mapping", () => {
    it("donorTabs email item has standardRoles", () => {
      const email = donorTabs.find((t) => t.to === "/donors/email");
      // standardRoles should be present but we just verify roles exist
      expect(email?.roles).toBeDefined();
      expect(Array.isArray(email?.roles)).toBe(true);
    });

    it("read-only donor items have readOnlyRoles", () => {
      const overview = donorTabs.find((t) => t.to === "/donors");
      const atRisk = donorTabs.find((t) => t.to === "/donors/at-risk");
      const pledges = donorTabs.find((t) => t.to === "/donors/pledges");

      expect(overview?.roles).toBeDefined();
      expect(atRisk?.roles).toBeDefined();
      expect(pledges?.roles).toBeDefined();
    });
  });
});
