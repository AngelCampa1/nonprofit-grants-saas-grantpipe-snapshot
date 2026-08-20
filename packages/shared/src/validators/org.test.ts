import { describe, expect, it } from "vitest";
import {
  createInviteSchema,
  createEntitySchema,
  entityAccessSchema,
  entityListQuerySchema,
  orgProfileSchema,
  updateEntitySchema,
  updateOrgProfileSchema,
  orgTeamListSchema,
  updateEntityAccessSchema,
  updateOrgMemberSchema,
  billingCheckoutSchema,
  billingSelectionSchema,
  billingPortalSchema,
  debugInspectionListSchema,
  updateOrgSettingsSchema,
} from "./org";
import {
  ENTITY_KINDS,
  ENTITY_ROLE_LABELS,
  ENTITY_ROLES,
  ENTITY_STATUSES,
  FISCAL_SPONSOR_MODELS,
  getDefaultPermissionsForEntityRole,
} from "../types";

describe("org validators", () => {
  it("parses org profile updates with optional branding fields", () => {
    const result = updateOrgProfileSchema.parse({
      name: "GrantPipe Foundation",
      ein: "12-3456789",
      fiscalYearStartMonth: 7,
      timezone: "America/Chicago",
      logoUrl: "https://example.com/logo.png",
      address: "123 Main St",
    });

    expect(result.name).toBe("GrantPipe Foundation");
    expect(result.fiscalYearStartMonth).toBe(7);
  });

  it("rejects invalid fiscal year values", () => {
    expect(() =>
      updateOrgProfileSchema.parse({
        name: "GrantPipe Foundation",
        fiscalYearStartMonth: 13,
        timezone: "America/Chicago",
      }),
    ).toThrow();
  });

  it("parses org profile responses with plan information", () => {
    const result = orgProfileSchema.parse({
      id: "org-1",
      name: "GrantPipe Foundation",
      slug: "grantpipe-foundation",
      ein: null,
      fiscalYearStartMonth: 1,
      timezone: "America/New_York",
      logoUrl: null,
      address: null,
      planTier: "starter",
      onboardingCompleted: true,
      accountingEnabled: true,
      createdAt: "2026-04-08T00:00:00.000Z",
      updatedAt: "2026-04-08T00:00:00.000Z",
    });

    expect(result.planTier).toBe("starter");
    expect(result.accountingEnabled).toBe(true);
  });

  it("parses team list filters and role updates", () => {
    expect(orgTeamListSchema.parse({ includeInactive: "true" }).includeInactive).toBe(true);
    expect(updateOrgMemberSchema.parse({ role: "editor" }).role).toBe("editor");
  });

  it("parses org member permission overrides", () => {
    const parsed = updateOrgMemberSchema.parse({
      role: "viewer",
      permissions: {
        donors: "view",
        grants: "edit",
        accounting: "none",
      },
    });

    expect(parsed.permissions?.donors).toBe("view");
    expect(parsed.permissions?.grants).toBe("edit");
    expect(parsed.permissions?.accounting).toBe("none");
  });

  it("parses billing actions and debug inspection queries", () => {
    const checkoutAttemptId = "f7bc1df2-5375-4a8e-a43d-c61f863a034b";
    const checkout = billingCheckoutSchema.parse({ planTier: "growth", checkoutAttemptId });
    expect(checkout.planTier).toBe("growth");
    expect(checkout.billingCycle).toBe("annual");
    expect(checkout.surface).toBe("settings");
    expect(checkout.promoCode).toBeUndefined();
    expect(
      billingCheckoutSchema.parse({
        planTier: "growth",
        billingCycle: "annual",
        surface: "paywall",
        checkoutAttemptId,
      }).surface,
    ).toBe("paywall");
    const selection = billingSelectionSchema.parse({ planTier: "starter", billingCycle: "annual" });
    expect(selection).toEqual({
      planTier: "starter",
      billingCycle: "annual",
    });
    expect(billingPortalSchema.parse({ returnPath: "/settings" }).returnPath).toBe("/settings");
    expect(billingPortalSchema.parse({}).returnPath).toBe("/settings");
    expect(debugInspectionListSchema.parse({ page: "2", pageSize: "10" }).page).toBe(2);
  });

  it("rejects Enterprise from self-serve billing actions", () => {
    expect(() => billingCheckoutSchema.parse({ planTier: "enterprise" })).toThrow();
    expect(() => billingSelectionSchema.parse({ planTier: "enterprise" })).toThrow();
  });

  it("accepts only UUID checkout attempt identifiers", () => {
    const checkoutAttemptId = "f7bc1df2-5375-4a8e-a43d-c61f863a034b";

    expect(
      billingCheckoutSchema.parse({ planTier: "growth", checkoutAttemptId }).checkoutAttemptId,
    ).toBe(checkoutAttemptId);
    expect(() =>
      billingCheckoutSchema.parse({ planTier: "growth", checkoutAttemptId: "same-plan-forever" }),
    ).toThrow();
    expect(() => billingCheckoutSchema.parse({ planTier: "growth" })).toThrow();
  });

  it("normalizes promo codes to upper case and rejects illegal characters", () => {
    expect(
      billingCheckoutSchema.parse({
        planTier: "starter",
        billingCycle: "annual",
        promoCode: "y80off",
        checkoutAttemptId: "f7bc1df2-5375-4a8e-a43d-c61f863a034b",
      }),
    ).toEqual({
      planTier: "starter",
      billingCycle: "annual",
      promoCode: "Y80OFF",
      surface: "settings",
      checkoutAttemptId: "f7bc1df2-5375-4a8e-a43d-c61f863a034b",
    });

    expect(() =>
      billingCheckoutSchema.parse({ planTier: "starter", promoCode: "bad code!" }),
    ).toThrow();

    // Dotted codes (e.g. partner tags like "ref.x1") are allowed for checkout.
    expect(
      billingCheckoutSchema.parse({
        planTier: "starter",
        promoCode: "ref.x1",
        checkoutAttemptId: "f7bc1df2-5375-4a8e-a43d-c61f863a034b",
      }).promoCode,
    ).toBe("REF.X1");
    expect(() =>
      billingSelectionSchema.parse({ planTier: "growth", promoCode: "ref.x1" }),
    ).toThrow();

    expect(() => billingCheckoutSchema.parse({ planTier: "starter", promoCode: "" })).toThrow();

    expect(() =>
      billingCheckoutSchema.parse({ planTier: "starter", billingCycle: "weekly" }),
    ).toThrow();
    expect(() => billingCheckoutSchema.parse({ planTier: "starter", surface: "email" })).toThrow();
  });
});

describe("updateOrgSettingsSchema", () => {
  it("accepts accountingEnabled true", () => {
    const result = updateOrgSettingsSchema.safeParse({ accountingEnabled: true });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.accountingEnabled).toBe(true);
    }
  });

  it("accepts accountingEnabled false", () => {
    const result = updateOrgSettingsSchema.safeParse({ accountingEnabled: false });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.accountingEnabled).toBe(false);
    }
  });

  it("accepts empty object (all optional)", () => {
    const result = updateOrgSettingsSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects non-boolean accountingEnabled", () => {
    const result = updateOrgSettingsSchema.safeParse({ accountingEnabled: "yes" });
    expect(result.success).toBe(false);
  });
});

describe("entity validators", () => {
  it("exports the canonical entity contract constants", () => {
    expect(ENTITY_KINDS).toEqual([
      "root",
      "legal_entity",
      "sponsored_project",
      "agency_client",
      "consolidation_group",
    ]);
    expect(FISCAL_SPONSOR_MODELS).toEqual(["none", "model_a", "model_c"]);
    expect(ENTITY_ROLES).toEqual(["admin", "editor", "viewer", "auditor"]);
    expect(ENTITY_STATUSES).toEqual(["active", "archived"]);
    expect(ENTITY_ROLE_LABELS).toEqual({
      admin: "Entity admin",
      editor: "Entity editor",
      viewer: "Entity viewer",
      auditor: "Entity auditor",
    });
  });

  it("defines entity role permission defaults", () => {
    expect(getDefaultPermissionsForEntityRole("admin")).toMatchObject({
      entitySettings: "manage",
      entityTeam: "manage",
      grants: "manage",
      reports: "manage",
    });
    expect(getDefaultPermissionsForEntityRole("editor")).toMatchObject({
      entitySettings: "view",
      entityTeam: "none",
      grants: "edit",
      reports: "edit",
    });
    expect(getDefaultPermissionsForEntityRole("viewer")).toMatchObject({
      entitySettings: "view",
      entityTeam: "none",
      grants: "view",
      reports: "view",
    });
    expect(getDefaultPermissionsForEntityRole("auditor")).toMatchObject({
      entitySettings: "none",
      entityTeam: "none",
      grants: "view",
      reports: "view",
    });
  });

  it("parses create and update entity inputs", () => {
    const created = createEntitySchema.parse({
      name: "North County Program",
      kind: "sponsored_project",
      fiscalSponsorModel: "model_a",
      parentEntityId: "entity-root",
    });

    expect(created).toEqual({
      name: "North County Program",
      kind: "sponsored_project",
      fiscalSponsorModel: "model_a",
      parentEntityId: "entity-root",
    });

    expect(
      updateEntitySchema.parse({
        name: "North County Program",
        kind: "sponsored_project",
        status: "archived",
        fiscalSponsorModel: "model_c",
      }),
    ).toMatchObject({
      name: "North County Program",
      kind: "sponsored_project",
      status: "archived",
      fiscalSponsorModel: "model_c",
    });

    expect(updateEntitySchema.parse({ name: "Renamed Entity" })).toEqual({
      name: "Renamed Entity",
    });
    expect(updateEntitySchema.parse({ parentEntityId: null })).toEqual({
      parentEntityId: null,
    });
  });

  it("rejects invalid entity shapes", () => {
    expect(() => createEntitySchema.parse({ name: "", kind: "legal_entity" })).toThrow();
    expect(() => createEntitySchema.parse({ name: "Bad Kind", kind: "chapter" })).toThrow();
    expect(() =>
      createEntitySchema.parse({
        name: "Legal Entity",
        kind: "legal_entity",
        fiscalSponsorModel: "model_a",
      }),
    ).toThrow();
    expect(() =>
      updateEntitySchema.parse({
        fiscalSponsorModel: "model_a",
      }),
    ).toThrow();
    expect(() =>
      updateEntitySchema.parse({
        kind: "legal_entity",
        fiscalSponsorModel: "model_a",
      }),
    ).toThrow();
    expect(() =>
      updateEntitySchema.parse({
        kind: "legal_entity",
      }),
    ).toThrow();
    expect(
      updateEntitySchema.parse({
        kind: "legal_entity",
        fiscalSponsorModel: "none",
      }),
    ).toMatchObject({
      kind: "legal_entity",
      fiscalSponsorModel: "none",
    });
    expect(() => updateEntitySchema.parse({ status: "deleted" })).toThrow();
  });

  it("parses entity list and access contracts", () => {
    expect(entityListQuerySchema.parse({ includeArchived: "true" })).toEqual({
      includeArchived: true,
    });
    expect(entityListQuerySchema.parse({})).toEqual({ includeArchived: false });

    expect(
      entityAccessSchema.parse({
        entityId: " entity-1 ",
        role: "editor",
        permissions: {
          grants: "manage",
          reports: "view",
          entityTeam: "none",
        },
      }),
    ).toMatchObject({
      entityId: "entity-1",
      role: "editor",
      permissions: {
        grants: "manage",
        reports: "view",
        entityTeam: "none",
      },
    });

    expect(updateEntityAccessSchema.parse({ role: "viewer" })).toEqual({
      role: "viewer",
    });
    expect(updateEntityAccessSchema.parse({ permissions: { reports: "view" } })).toEqual({
      permissions: { reports: "view" },
    });
    expect(() => updateEntityAccessSchema.parse({ permissions: { donors: "view" } })).toThrow();
    expect(() => updateEntityAccessSchema.parse({})).toThrow(
      "At least one entity access field is required",
    );
  });

  it("parses entity-scoped invites without requiring every invite to be entity-scoped", () => {
    expect(createInviteSchema.parse({ role: "viewer" })).not.toHaveProperty("entityId");
    expect(
      createInviteSchema.parse({
        mode: "email",
        email: "client@example.org",
        role: "viewer",
        entityId: " entity-client-1 ",
      }),
    ).toMatchObject({
      mode: "email",
      email: "client@example.org",
      role: "viewer",
      entityId: "entity-client-1",
    });
  });
});
