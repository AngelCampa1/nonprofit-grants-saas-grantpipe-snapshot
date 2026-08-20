import { beforeEach, describe, it, expect, vi } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";
import { authRoutes } from "./routes";

describe("GET /auth/session", () => {
  const mockUser = { id: "user-1", email: "angel@example.com", name: "Angel Campa" };
  const mockSession = { id: "sess-1", userId: "user-1" };
  const mockOrgId = "org-1";
  const mockMemberRole = "admin" as const;
  const mockEntityPermissions = {
    entitySettings: "manage",
    entityTeam: "manage",
    grants: "manage",
    funds: "manage",
    documents: "manage",
    compliance: "manage",
    accounting: "manage",
    reports: "manage",
  } as const;
  const mockOrgSubscription = {
    subscriptionStatus: "active",
    trialEndsAt: new Date("2026-05-01T00:00:00.000Z"),
    planTier: "growth",
    onboardingCompleted: true,
    planSelectedAt: new Date("2026-04-20T00:00:00.000Z"),
    stripeSubscriptionId: "sub_123",
    onboardingGoal: "compliance" as const,
    defaultEntityId: "entity-1",
  };
  const mockOrgMemberFindFirst = vi.fn();
  const mockEntityMemberFindMany = vi.fn();

  function buildMockDb() {
    return {
      query: {
        orgMembers: {
          findFirst: mockOrgMemberFindFirst,
        },
        entityMembers: {
          findMany: mockEntityMemberFindMany,
        },
      },
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockOrgMemberFindFirst.mockResolvedValue({
      id: "org-member-1",
      orgId: mockOrgId,
      role: "admin",
    });
    mockEntityMemberFindMany.mockResolvedValue([
      {
        entityId: "entity-1",
        role: "admin",
        permissions: mockEntityPermissions,
        entity: {
          id: "entity-1",
          name: "Foundation Alpha",
          kind: "root",
          status: "active",
          fiscalSponsorModel: "none",
          parentEntityId: null,
        },
      },
      {
        entityId: "entity-2",
        role: "viewer",
        permissions: null,
        entity: {
          id: "entity-2",
          name: "Sponsored Project",
          kind: "sponsored_project",
          status: "active",
          fiscalSponsorModel: "model_a",
          parentEntityId: "entity-1",
        },
      },
    ]);
  });

  // Build a test app that simulates upstream middleware setting context variables
  const app = new Hono<AppEnv>()
    .use("/auth/*", async (c, next) => {
      c.set("db", buildMockDb() as never);
      c.set("user", mockUser);
      c.set("session", mockSession);
      c.set("orgId", mockOrgId);
      c.set("orgMemberId", "org-member-1");
      c.set("memberRole", mockMemberRole);
      c.set("entityId", "entity-1");
      c.set("entityScope", "entity");
      c.set("entityRole", "admin");
      c.set("entityPermissions", mockEntityPermissions);
      c.set("orgSubscription", mockOrgSubscription);
      await next();
    })
    .route("/auth", authRoutes);

  it("returns 200 with user, session id, orgId, and memberRole", async () => {
    const res = await app.request("/auth/session");

    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({
      user: mockUser,
      session: { id: mockSession.id },
      orgId: mockOrgId,
      memberRole: mockMemberRole,
      entityId: "entity-1",
      entityScope: "entity",
      entityRole: "admin",
      entityPermissions: mockEntityPermissions,
      activeEntity: {
        id: "entity-1",
        name: "Foundation Alpha",
        kind: "root",
        status: "active",
        fiscalSponsorModel: "none",
        parentEntityId: null,
        role: "admin",
        permissions: mockEntityPermissions,
        isDefault: true,
      },
      availableEntities: [
        {
          id: "entity-1",
          name: "Foundation Alpha",
          kind: "root",
          status: "active",
          fiscalSponsorModel: "none",
          parentEntityId: null,
          role: "admin",
          permissions: mockEntityPermissions,
          isDefault: true,
        },
        {
          id: "entity-2",
          name: "Sponsored Project",
          kind: "sponsored_project",
          status: "active",
          fiscalSponsorModel: "model_a",
          parentEntityId: "entity-1",
          role: "viewer",
          permissions: {
            entitySettings: "view",
            entityTeam: "none",
            grants: "view",
            funds: "view",
            documents: "view",
            compliance: "view",
            accounting: "view",
            reports: "view",
          },
          isDefault: false,
        },
      ],
      onboardingCompleted: true,
      planSelectionCompleted: true,
      onboardingGoal: "compliance",
      orgSubscription: {
        subscriptionStatus: "active",
        billingLifecycleState: "active",
        trialEndsAt: "2026-05-01T00:00:00.000Z",
        planTier: "growth",
        effectivePlanTier: "growth",
        onboardingCompleted: true,
        planSelectedAt: "2026-04-20T00:00:00.000Z",
        stripeSubscriptionId: "sub_123",
        onboardingGoal: "compliance",
      },
    });
    expect(mockOrgMemberFindFirst).not.toHaveBeenCalled();
    expect(mockEntityMemberFindMany).toHaveBeenCalledOnce();
  });

  it("returns null fields when context variables are not set", async () => {
    const bareApp = new Hono<AppEnv>()
      .use("/auth/*", async (c, next) => {
        c.set("user", null);
        c.set("session", null);
        c.set("db", buildMockDb() as never);
        c.set("orgId", null);
        c.set("memberRole", null);
        c.set("entityId", null);
        c.set("entityScope", null);
        c.set("entityRole", null);
        c.set("entityPermissions", null);
        await next();
      })
      .route("/auth", authRoutes);

    const res = await bareApp.request("/auth/session");

    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({
      user: null,
      session: {},
      orgId: null,
      memberRole: null,
      entityId: null,
      entityScope: null,
      entityRole: null,
      entityPermissions: null,
      activeEntity: null,
      availableEntities: [],
      onboardingCompleted: false,
      planSelectionCompleted: false,
      onboardingGoal: null,
      orgSubscription: null,
    });
  });

  it("uses middleware org member context even when subscription metadata is absent", async () => {
    const noSubscriptionApp = new Hono<AppEnv>()
      .use("/auth/*", async (c, next) => {
        c.set("db", buildMockDb() as never);
        c.set("user", mockUser);
        c.set("session", mockSession);
        c.set("orgId", mockOrgId);
        c.set("orgMemberId", "org-member-1");
        c.set("memberRole", mockMemberRole);
        c.set("entityId", "entity-1");
        c.set("entityScope", "entity");
        c.set("entityRole", "admin");
        c.set("entityPermissions", mockEntityPermissions);
        c.set("orgSubscription", null);
        await next();
      })
      .route("/auth", authRoutes);

    const res = await noSubscriptionApp.request("/auth/session");
    const body = (await res.json()) as {
      activeEntity: { id: string; isDefault: boolean } | null;
      availableEntities: Array<{ id: string; isDefault: boolean }>;
    };

    expect(res.status).toBe(200);
    expect(body.activeEntity).toMatchObject({ id: "entity-1", isDefault: false });
    expect(body.availableEntities[0]).toMatchObject({ id: "entity-1", isDefault: false });
    expect(mockOrgMemberFindFirst).not.toHaveBeenCalled();
  });

  it("normalizes unknown subscription statuses to trialing for client paywall parity", async () => {
    const normalizedApp = new Hono<AppEnv>()
      .use("/auth/*", async (c, next) => {
        c.set("user", mockUser);
        c.set("session", mockSession);
        c.set("db", buildMockDb() as never);
        c.set("orgId", mockOrgId);
        c.set("memberRole", mockMemberRole);
        c.set("orgSubscription", {
          ...mockOrgSubscription,
          subscriptionStatus: "legacy_status",
        });
        await next();
      })
      .route("/auth", authRoutes);

    const res = await normalizedApp.request("/auth/session");
    const body = (await res.json()) as {
      orgSubscription?: {
        subscriptionStatus?: string | null;
      } | null;
    };

    expect(body.orgSubscription).toMatchObject({
      subscriptionStatus: "trialing",
      billingLifecycleState: "expired",
    });
  });

  it("exposes expired as a first-class lifecycle state without changing plan tier", async () => {
    const expiredApp = new Hono<AppEnv>()
      .use("/auth/*", async (c, next) => {
        c.set("user", mockUser);
        c.set("session", mockSession);
        c.set("db", buildMockDb() as never);
        c.set("orgId", mockOrgId);
        c.set("memberRole", mockMemberRole);
        c.set("orgSubscription", {
          ...mockOrgSubscription,
          subscriptionStatus: "expired",
          trialEndsAt: new Date("2026-04-01T00:00:00.000Z"),
          planTier: "growth",
          stripeSubscriptionId: null,
        });
        await next();
      })
      .route("/auth", authRoutes);

    const res = await expiredApp.request("/auth/session");
    const body = (await res.json()) as {
      orgSubscription?: {
        subscriptionStatus?: string | null;
        billingLifecycleState?: string | null;
        effectivePlanTier?: string | null;
      } | null;
    };

    expect(body.orgSubscription).toMatchObject({
      subscriptionStatus: "expired",
      billingLifecycleState: "expired",
      effectivePlanTier: "growth",
    });
  });

  it("exposes the selected plan as the effective tier for active Starter trials", async () => {
    const trialApp = new Hono<AppEnv>()
      .use("/auth/*", async (c, next) => {
        c.set("user", mockUser);
        c.set("session", mockSession);
        c.set("db", buildMockDb() as never);
        c.set("orgId", mockOrgId);
        c.set("memberRole", mockMemberRole);
        c.set("orgSubscription", {
          ...mockOrgSubscription,
          subscriptionStatus: "trialing",
          trialEndsAt: new Date("2099-01-01T00:00:00.000Z"),
          planTier: "starter",
          stripeSubscriptionId: null,
        });
        await next();
      })
      .route("/auth", authRoutes);

    const res = await trialApp.request("/auth/session");
    const body = (await res.json()) as {
      orgSubscription?: {
        planTier?: string | null;
        effectivePlanTier?: string | null;
      } | null;
    };

    expect(body.orgSubscription).toMatchObject({
      planTier: "starter",
      billingLifecycleState: "trialing",
      effectivePlanTier: "starter",
    });
  });

  it("returns nullable subscription fields when the org subscription row is sparse", async () => {
    const sparseApp = new Hono<AppEnv>()
      .use("/auth/*", async (c, next) => {
        c.set("user", mockUser);
        c.set("session", mockSession);
        c.set("db", buildMockDb() as never);
        c.set("orgId", mockOrgId);
        c.set("memberRole", mockMemberRole);
        c.set("orgSubscription", {
          subscriptionStatus: null,
          trialEndsAt: null,
          planTier: null,
          onboardingCompleted: false,
          planSelectedAt: null,
          stripeSubscriptionId: null,
          onboardingGoal: null,
        });
        await next();
      })
      .route("/auth", authRoutes);

    const res = await sparseApp.request("/auth/session");
    const body = await res.json();

    expect(body).toMatchObject({
      orgSubscription: {
        subscriptionStatus: null,
        billingLifecycleState: "expired",
        trialEndsAt: null,
        planTier: null,
        effectivePlanTier: "starter",
        stripeSubscriptionId: null,
      },
    });
  });

  it("round-trips a real onboardingGoal value through the session response", async () => {
    const goalApp = new Hono<AppEnv>()
      .use("/auth/*", async (c, next) => {
        c.set("user", mockUser);
        c.set("session", mockSession);
        c.set("db", buildMockDb() as never);
        c.set("orgId", mockOrgId);
        c.set("memberRole", mockMemberRole);
        c.set("orgSubscription", {
          ...mockOrgSubscription,
          onboardingGoal: "grants" as const,
        });
        await next();
      })
      .route("/auth", authRoutes);

    const res = await goalApp.request("/auth/session");
    const body = (await res.json()) as {
      onboardingGoal: unknown;
      orgSubscription: { onboardingGoal: unknown };
    };

    expect(body.onboardingGoal).toBe("grants");
    expect(body.orgSubscription.onboardingGoal).toBe("grants");
  });

  it("returns onboardingGoal null when orgSubscription is absent", async () => {
    const noSubApp = new Hono<AppEnv>()
      .use("/auth/*", async (c, next) => {
        c.set("user", mockUser);
        c.set("session", mockSession);
        c.set("db", buildMockDb() as never);
        c.set("orgId", mockOrgId);
        c.set("memberRole", mockMemberRole);
        c.set("orgSubscription", null);
        await next();
      })
      .route("/auth", authRoutes);

    const res = await noSubApp.request("/auth/session");
    const body = (await res.json()) as { onboardingGoal: unknown };

    expect(body.onboardingGoal).toBeNull();
  });
});
