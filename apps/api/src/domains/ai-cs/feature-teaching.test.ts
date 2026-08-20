import { describe, expect, it } from "vitest";
import type { FeatureKnowledge } from "@grantpipe/shared/knowledge";
import { FEATURE_KNOWLEDGE } from "@grantpipe/shared/knowledge";
import { getDefaultPermissionsForRole, ROLE_LABELS, ROLES } from "@grantpipe/shared";
import {
  buildRoleCapabilityFaqs,
  buildTeachingFields,
  featureAreaForRoute,
  filterFeaturesByRole,
} from "./feature-teaching";

const roleGated: FeatureKnowledge = {
  key: "grants",
  route: "/grants",
  title: "Grants",
  what: "The Grants screen tracks funder money.",
  why: "Keeps restricted money separate.",
  how: [{ label: "Add grant", action: "Choose Add grant to start a record." }],
  uiLabels: ["Add grant"],
  roles: ["admin", "editor"],
  notFeatures: ["Plain donations — those live in Donors."],
};

const donors: FeatureKnowledge = {
  key: "donors",
  route: "/donors",
  title: "Donors",
  what: "The Donors screen lists people who give.",
  why: "Keeps giving history in one place.",
  how: [{ label: "Add donor", action: "Choose Add donor to start a record." }],
  uiLabels: ["Add donor"],
  roles: ["admin", "editor", "viewer"],
};

const importScreen: FeatureKnowledge = {
  key: "import",
  route: "/import",
  title: "Import",
  what: "The Import screen loads a CSV file.",
  why: "Saves typing each record by hand.",
  how: [{ label: "Upload CSV", action: "Choose Upload CSV to begin." }],
  uiLabels: ["Upload CSV"],
  roles: ["admin", "editor"],
};

const roleAgnostic: FeatureKnowledge = {
  key: "dashboard",
  route: "/",
  title: "Dashboard",
  what: "The Dashboard is the home screen.",
  why: "Gives an at-a-glance view.",
  how: [{ label: "Overview", action: "Read the Overview cards." }],
  uiLabels: ["Overview"],
};

const gatedNoArea: FeatureKnowledge = {
  key: "radar",
  route: "/radar",
  title: "Deadline Radar",
  what: "The Radar shows what is due soon.",
  why: "Keeps deadlines from slipping.",
  how: [{ label: "Open Radar", action: "Read the deadline list." }],
  uiLabels: ["Open Radar"],
  roles: ["admin", "editor", "viewer"],
};

// A donor-area screen whose navigation is gated tighter than the donors
// permission area: viewer can VIEW donors generally, but cannot open this
// particular screen. The look-only line must respect the screen allow-list,
// never naming a role that cannot even reach the screen.
const donorsScreenAdminEditorOnly: FeatureKnowledge = {
  key: "donor-email",
  route: "/donors/email",
  title: "Donor Email",
  what: "The Donor Email screen sends segmented donor messages.",
  why: "Keeps donor outreach organized.",
  how: [{ label: "Create segment", action: "Choose Create segment." }],
  uiLabels: ["Create segment"],
  roles: ["admin", "editor"],
};

describe("filterFeaturesByRole", () => {
  it("returns everything when memberRole is undefined", () => {
    const result = filterFeaturesByRole([roleGated, roleAgnostic], undefined);
    expect(result).toHaveLength(2);
  });

  it("keeps role-agnostic features for a null (no-membership) role", () => {
    const result = filterFeaturesByRole([roleGated, roleAgnostic], null);
    expect(result).toEqual([roleAgnostic]);
  });

  it("keeps role-agnostic and matching-role features for a concrete role", () => {
    const result = filterFeaturesByRole([roleGated, roleAgnostic], "editor");
    expect(result.map((f) => f.key)).toEqual(["grants", "dashboard"]);
  });

  it("drops a role-gated feature the role cannot reach", () => {
    const result = filterFeaturesByRole([roleGated, roleAgnostic], "viewer");
    expect(result.map((f) => f.key)).toEqual(["dashboard"]);
  });
});

describe("featureAreaForRoute", () => {
  it("maps a top-level screen route to its feature area", () => {
    expect(featureAreaForRoute("/donors")).toBe("donors");
    expect(featureAreaForRoute("/accounting")).toBe("accounting");
  });

  it("maps a nested screen route to its parent feature area", () => {
    expect(featureAreaForRoute("/donors/email")).toBe("donors");
    expect(featureAreaForRoute("/accounting/ledger")).toBe("accounting");
  });

  it("maps the most specific settings sub-route before the settings catch-all", () => {
    expect(featureAreaForRoute("/settings/team")).toBe("team");
    expect(featureAreaForRoute("/settings/billing")).toBe("billing");
    expect(featureAreaForRoute("/settings/portal-access")).toBe("settings");
    expect(featureAreaForRoute("/settings")).toBe("settings");
  });

  it("returns undefined for routes with no write-gated area", () => {
    expect(featureAreaForRoute("/")).toBeUndefined();
    expect(featureAreaForRoute("/radar")).toBeUndefined();
    expect(featureAreaForRoute("/help")).toBeUndefined();
  });
});

describe("buildTeachingFields", () => {
  it("maps how-to steps with exact button labels and 1-based numbering", () => {
    const { howtos } = buildTeachingFields([roleGated]);
    expect(howtos[0]?.steps[0]).toEqual({
      n: 1,
      instruction: "Choose Add grant to start a record.",
      screen: "Grants",
      button: "Add grant",
      path: "/grants",
    });
  });

  it("states action permission from the permission map, not screen reach", () => {
    // Donors: admin/editor can change; viewer can only look; auditor has no access.
    const { howtos } = buildTeachingFields([donors]);
    const prereqs = howtos[0]?.prerequisites ?? [];
    expect(prereqs[0]).toBe("Only Admin or Editor can add or change things here.");
    expect(prereqs[1]).toBe("Viewer can look here but cannot change anything.");
    // The misleading "viewer CAN add/change" framing must never appear.
    expect(prereqs.join(" ")).not.toMatch(/viewer can (add|change|create|edit)/i);
    // Auditor has no donor access, so it must not be listed as a look-only role.
    expect(prereqs.join(" ")).not.toContain("Auditor");
  });

  it("names both change and look-only roles for a shared-access screen", () => {
    // A grants screen every role can reach: admin/editor change, viewer/auditor look.
    const grantsSharedAll: FeatureKnowledge = {
      ...roleGated,
      roles: ["admin", "editor", "viewer", "auditor"],
    };
    const { howtos } = buildTeachingFields([grantsSharedAll]);
    expect(howtos[0]?.prerequisites).toEqual([
      "Only Admin or Editor can add or change things here.",
      "Viewer and Auditor can look here but cannot change anything.",
    ]);
  });

  it("omits the look-only line when no role is view-only for the area", () => {
    // Import: admin/editor edit; viewer and auditor have no access at all.
    const { howtos } = buildTeachingFields([importScreen]);
    expect(howtos[0]?.prerequisites).toEqual([
      "Only Admin or Editor can add or change things here.",
    ]);
  });

  it("never names a look-only role the screen's allow-list excludes", () => {
    // Donors area lets viewers look, but THIS screen is admin/editor only.
    const { howtos } = buildTeachingFields([donorsScreenAdminEditorOnly]);
    const prereqs = howtos[0]?.prerequisites ?? [];
    expect(prereqs).toEqual(["Only Admin or Editor can add or change things here."]);
    // The viewer can view the donors area in general but not open this screen,
    // so it must never be named as able to look here.
    expect(prereqs.join(" ")).not.toContain("Viewer");
  });

  it("derives roles from the area when a screen has no navigation allow-list", () => {
    // Donors screen with no `roles` field: the area alone gates it.
    const donorsNoAllowList: FeatureKnowledge = {
      key: "donors-open",
      route: "/donors",
      title: "Donors",
      what: "The Donors screen lists people who give.",
      why: "Keeps giving history in one place.",
      how: [{ label: "Add donor", action: "Choose Add donor." }],
      uiLabels: ["Add donor"],
    };
    const { howtos } = buildTeachingFields([donorsNoAllowList]);
    expect(howtos[0]?.prerequisites).toEqual([
      "Only Admin or Editor can add or change things here.",
      "Viewer can look here but cannot change anything.",
    ]);
  });

  it("uses an open-screen note when the allow-list excludes every change and look role", () => {
    // Team area: only Admin manages it; this screen is gated to Editor, who has
    // no team permission at all. No change or look-only role qualifies, so the
    // prerequisite states who may open the screen instead of listing nobody.
    const teamScreenEditorOnly: FeatureKnowledge = {
      key: "team-editor-gated",
      route: "/settings/team",
      title: "Team",
      what: "The Team screen manages who can sign in.",
      why: "Controls access to your data.",
      how: [{ label: "Invite teammate", action: "Choose Invite teammate." }],
      uiLabels: ["Invite teammate"],
      roles: ["editor"],
    };
    const { howtos } = buildTeachingFields([teamScreenEditorOnly]);
    expect(howtos[0]?.prerequisites).toEqual(["Only Editor can open this screen."]);
  });

  it("falls back to a screen-open prerequisite for a gated route with no write area", () => {
    const { howtos } = buildTeachingFields([gatedNoArea]);
    expect(howtos[0]?.prerequisites).toEqual([
      "Only Admin, Editor, or Viewer can open this screen.",
    ]);
  });

  it("leaves prerequisites undefined for a role-agnostic feature with no area", () => {
    const { howtos } = buildTeachingFields([roleAgnostic]);
    expect(howtos[0]?.prerequisites).toBeUndefined();
  });

  it("derives plain-language concepts", () => {
    const { concepts } = buildTeachingFields([roleGated]);
    expect(concepts[0]).toEqual({
      term: "Grants",
      plainDefinition: "The Grants screen tracks funder money.",
      whyItMatters: "Keeps restricted money separate.",
      path: "/grants",
    });
  });

  it("turns notFeatures into disambiguating FAQs", () => {
    const { faqs } = buildTeachingFields([roleGated]);
    expect(faqs).toHaveLength(1);
    expect(faqs[0]?.answer).toBe("No. Plain donations — those live in Donors.");
  });

  it("emits no per-feature FAQs for a feature without notFeatures", () => {
    const { faqs } = buildTeachingFields([roleAgnostic]);
    expect(faqs).toEqual([]);
  });
});

describe("real knowledge base prerequisite invariants", () => {
  it("never names a look-only role that the real screen's allow-list excludes", () => {
    for (const feature of FEATURE_KNOWLEDGE) {
      const area = featureAreaForRoute(feature.route);
      if (!area || !feature.roles) continue;
      const allowed = feature.roles;
      const { howtos } = buildTeachingFields([feature]);
      const prereqText = (howtos[0]?.prerequisites ?? []).join(" ");
      for (const role of ROLES) {
        const canViewArea = getDefaultPermissionsForRole(role)[area] === "view";
        const reachesScreen = allowed.includes(role);
        // A role that can view the area but cannot open this screen must never
        // appear in the look-only prerequisite text.
        if (canViewArea && !reachesScreen) {
          expect(prereqText).not.toContain(ROLE_LABELS[role]);
        }
      }
    }
  });
});

describe("buildRoleCapabilityFaqs", () => {
  it("emits one capability FAQ per role", () => {
    const faqs = buildRoleCapabilityFaqs();
    expect(faqs.map((f) => f.question)).toEqual([
      "What can an Admin do in GrantPipe?",
      "What can an Editor do in GrantPipe?",
      "What can a Viewer do in GrantPipe?",
      "What can an Auditor do in GrantPipe?",
    ]);
  });

  it("says an Admin can do everything", () => {
    const admin = buildRoleCapabilityFaqs().find((f) => f.question.includes("Admin"));
    expect(admin?.answer.toLowerCase()).toContain("everything");
  });

  it("says an Editor can change records but not the team or billing", () => {
    const editor = buildRoleCapabilityFaqs().find((f) => f.question.includes("Editor"));
    expect(editor?.answer).toContain("add or change");
    expect(editor?.answer.toLowerCase()).toContain("cannot");
    expect(editor?.answer.toLowerCase()).toContain("team");
  });

  it("says a Viewer cannot add or change anything", () => {
    const viewer = buildRoleCapabilityFaqs().find((f) => f.question.includes("Viewer"));
    expect(viewer?.answer.toLowerCase()).toContain("cannot add or change anything");
    // A viewer can still look at donors.
    expect(viewer?.answer.toLowerCase()).toContain("donors");
  });

  it("says an Auditor can view grants but never as able to see donors", () => {
    const auditor = buildRoleCapabilityFaqs().find((f) => f.question.includes("Auditor"));
    expect(auditor?.answer.toLowerCase()).toContain("grants");
    // Auditor has no donor access: donors must be in the "cannot open" list,
    // never in the "can view" list.
    expect(auditor?.answer.toLowerCase()).toMatch(/cannot open[^.]*donors/);
    expect(auditor?.answer.toLowerCase()).not.toMatch(/can also view[^.]*donors/);
  });
});
