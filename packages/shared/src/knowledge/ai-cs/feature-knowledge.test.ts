import { describe, expect, it } from "vitest";
import { PLAN_ENTITLEMENTS } from "../../constants";
import { FEATURE_KNOWLEDGE } from "./feature-knowledge";

describe("FEATURE_KNOWLEDGE invariants", () => {
  it("has unique keys", () => {
    const keys = FEATURE_KNOWLEDGE.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("has unique routes", () => {
    const routes = FEATURE_KNOWLEDGE.map((f) => f.route);
    expect(new Set(routes).size).toBe(routes.length);
  });

  it("every entry has non-empty what/why and at least one how step", () => {
    for (const f of FEATURE_KNOWLEDGE) {
      expect(f.what.trim().length, f.key).toBeGreaterThan(0);
      expect(f.why.trim().length, f.key).toBeGreaterThan(0);
      expect(f.how.length, f.key).toBeGreaterThan(0);
    }
  });

  it("every how-step label is declared in the entry uiLabels", () => {
    for (const f of FEATURE_KNOWLEDGE) {
      for (const step of f.how) {
        expect(f.uiLabels, `${f.key}: ${step.label}`).toContain(step.label);
      }
    }
  });

  it("includes the grants screen", () => {
    const grants = FEATURE_KNOWLEDGE.find((f) => f.key === "grants");
    expect(grants?.route).toBe("/grants");
    expect(grants?.uiLabels).toContain("Add grant");
  });

  it("teaches restricted fund questions with program language", () => {
    const funds = FEATURE_KNOWLEDGE.find((f) => f.key === "funds");
    expect(funds?.route).toBe("/funds");
    expect(funds?.what.toLowerCase()).toContain("program");
  });

  it("teaches the Report Builder as an Enterprise capability, matching entitlements", () => {
    const rb = FEATURE_KNOWLEDGE.find((f) => f.key === "report_builder");
    expect(rb?.why).toContain("Enterprise plan");
    expect(rb?.why).not.toMatch(/Audit-Ready plan/);
    // Source of truth: only Enterprise carries the cross-entity report builder.
    expect(PLAN_ENTITLEMENTS.enterprise.hasCrossEntityReportBuilder).toBe(true);
    expect(PLAN_ENTITLEMENTS.audit_ready.hasCrossEntityReportBuilder).toBe(false);
  });

  it("teaches the team invite flow accurately: role comes from Base role, not Invite type", () => {
    // Regression: the KB previously claimed "Invite type" sets the role. In the
    // product, Invite type only picks the delivery method (Shareable link vs
    // Specific email); the role is the separate "Base role" control. AI-CS
    // repeated the KB's error verbatim, so the fix lives in the KB.
    const team = FEATURE_KNOWLEDGE.find((f) => f.key === "settings_team");
    expect(team?.route).toBe("/settings/team");

    const inviteType = team?.how.find((s) => s.label === "Invite type");
    expect(inviteType, "team must teach the Invite type control").toBeDefined();
    expect(inviteType?.action.toLowerCase()).toMatch(/link|email/);
    expect(inviteType?.action.toLowerCase()).not.toContain("role");

    const baseRole = team?.how.find((s) => s.label === "Base role");
    expect(baseRole, "team must teach the Base role control").toBeDefined();
    expect(baseRole?.action.toLowerCase()).toContain("role");

    expect(team?.uiLabels).toEqual(
      expect.arrayContaining(["Invite type", "Base role", "Shareable link", "Specific email"]),
    );
  });

  it("teaches entity settings as an admin-only setup screen", () => {
    const entities = FEATURE_KNOWLEDGE.find((f) => f.key === "settings_entities");
    expect(entities?.route).toBe("/settings/entities");
    expect(entities?.roles).toEqual(["admin"]);
    expect(entities?.uiLabels).toEqual(
      expect.arrayContaining([
        "Add entity",
        "Entity type",
        "Parent entity",
        "Fiscal sponsor model",
        "Archive",
      ]),
    );
  });

  it("teaches AI Award Intake with the included-on-every-paid-plan and Starter cap facts", () => {
    const intake = FEATURE_KNOWLEDGE.find((f) => f.key === "award_intake");
    expect(intake?.route).toBe("/award-intake/$extractionId");
    expect(intake?.title).toBe("AI Award Intake");
    // Only roles that can create grants reach this screen.
    expect(intake?.roles).toEqual(["admin", "editor"]);
    const copy = `${intake?.what} ${intake?.why}`;
    expect(copy).toContain("every paid plan");
    // The Starter cap number is interpolated from the single source of truth.
    expect(copy).toContain(String(PLAN_ENTITLEMENTS.starter.awardIntakeMonthlyCap));
    expect(copy.toLowerCase()).toContain("unlimited");
  });

  it("teaches ask-your-ledger as Growth and up", () => {
    const askLedger = FEATURE_KNOWLEDGE.find((f) => f.key === "ask_ledger");
    const copy = `${askLedger?.what} ${askLedger?.why}`;
    expect(copy).toMatch(/Growth/);
    expect(copy).not.toMatch(/Starter gives you/);
    expect(copy).not.toMatch(/questions each month/);
    expect(copy).not.toContain("every paid plan");
    expect(copy.toLowerCase()).toContain("unlimited");
  });

  it("teaches moved payment and budget features at their new tiers", () => {
    const cash = FEATURE_KNOWLEDGE.find((f) => f.key === "cash");
    const budget = FEATURE_KNOWLEDGE.find((f) => f.key === "budget_sentinel");

    expect(cash?.why).toContain("Growth plans and up");
    expect(cash?.why).toContain("indirect cost rules");
    expect(cash?.why).toContain("reimbursement evidence packets");
    expect(budget?.why).toContain("Starter plans and up");
    expect(budget?.why).toContain("budget exports");
  });

  it("pins the consolidated nav routes and renamed labels so nav churn cannot silently drift", () => {
    const calendar = FEATURE_KNOWLEDGE.find((f) => f.key === "calendar");
    expect(calendar?.route).toBe("/deadlines/calendar");

    const radar = FEATURE_KNOWLEDGE.find((f) => f.key === "deadline_radar");
    expect(radar?.route).toBe("/deadlines");

    const cash = FEATURE_KNOWLEDGE.find((f) => f.key === "cash");
    expect(cash?.title).toBe("Payments");
    expect(cash?.uiLabels).toContain("Payments");
    expect(cash?.uiLabels).not.toContain("Cash");

    const importFeature = FEATURE_KNOWLEDGE.find((f) => f.key === "import");
    expect(importFeature?.title).toBe("Import");
    expect(importFeature?.route).toBe("/import");
    expect(importFeature?.uiLabels).toContain("Import");
    expect(importFeature?.uiLabels).not.toContain("Migration Studio");

    const awardIntake = FEATURE_KNOWLEDGE.find((f) => f.key === "award_intake");
    expect(awardIntake?.notFeatures?.join(" ")).not.toContain("Migration Studio");
  });
});
