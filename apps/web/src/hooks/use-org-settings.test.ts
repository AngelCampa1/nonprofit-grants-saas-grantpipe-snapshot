import React from "react";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockCaptureEvent,
  mockCaptureAppException,
  mockProfileGet,
  mockProfilePatch,
  mockTeamGet,
  mockInvitePost,
  mockMemberPatch,
  mockEntityAccessPost,
  mockEntityAccessPatch,
  mockEntityAccessDelete,
  mockBillingGet,
  mockBillingCheckoutPost,
  mockBillingSelectionPatch,
  mockBillingPortalPost,
  mockDebugEmailsGet,
  mockDebugStorageGet,
  mockDebugBillingGet,
  mockDebugAnalyticsGet,
  mockDebugErrorsGet,
  mockMembershipsGet,
  mockEntitiesGet,
  mockEntitiesPost,
  mockEntityPatch,
  mockEntityArchivePost,
} = vi.hoisted(() => ({
  mockCaptureEvent: vi.fn(),
  mockCaptureAppException: vi.fn(),
  mockProfileGet: vi.fn(),
  mockProfilePatch: vi.fn(),
  mockTeamGet: vi.fn(),
  mockInvitePost: vi.fn(),
  mockMemberPatch: vi.fn(),
  mockEntityAccessPost: vi.fn(),
  mockEntityAccessPatch: vi.fn(),
  mockEntityAccessDelete: vi.fn(),
  mockBillingGet: vi.fn(),
  mockBillingCheckoutPost: vi.fn(),
  mockBillingSelectionPatch: vi.fn(),
  mockBillingPortalPost: vi.fn(),
  mockDebugEmailsGet: vi.fn(),
  mockDebugStorageGet: vi.fn(),
  mockDebugBillingGet: vi.fn(),
  mockDebugAnalyticsGet: vi.fn(),
  mockDebugErrorsGet: vi.fn(),
  mockMembershipsGet: vi.fn(),
  mockEntitiesGet: vi.fn(),
  mockEntitiesPost: vi.fn(),
  mockEntityPatch: vi.fn(),
  mockEntityArchivePost: vi.fn(),
}));

vi.mock("../lib/analytics", () => ({
  captureEvent: mockCaptureEvent,
}));

vi.mock("../lib/sentry", () => ({
  captureAppException: mockCaptureAppException,
}));

vi.mock("../lib/api-client", () => ({
  api: {
    api: {
      org: {
        profile: {
          $get: mockProfileGet,
          $patch: mockProfilePatch,
        },
        team: {
          $get: mockTeamGet,
          ":memberId": {
            $patch: mockMemberPatch,
            "entity-access": {
              $post: mockEntityAccessPost,
              ":entityId": {
                $patch: mockEntityAccessPatch,
                $delete: mockEntityAccessDelete,
              },
            },
          },
        },
        invites: {
          $post: mockInvitePost,
        },
        billing: {
          $get: mockBillingGet,
          checkout: {
            $post: mockBillingCheckoutPost,
          },
          selection: {
            $patch: mockBillingSelectionPatch,
          },
          portal: {
            $post: mockBillingPortalPost,
          },
        },
        debug: {
          emails: {
            $get: mockDebugEmailsGet,
          },
          storage: {
            $get: mockDebugStorageGet,
          },
          billing: {
            $get: mockDebugBillingGet,
          },
          analytics: {
            $get: mockDebugAnalyticsGet,
          },
          errors: {
            $get: mockDebugErrorsGet,
          },
        },
        memberships: {
          $get: mockMembershipsGet,
        },
        entities: {
          $get: mockEntitiesGet,
          $post: mockEntitiesPost,
          ":entityId": {
            $patch: mockEntityPatch,
            archive: {
              $post: mockEntityArchivePost,
            },
          },
        },
      },
    },
  },
}));

import {
  useBillingCheckoutMutation,
  useOrgBilling,
  useOrgDebugData,
  useOrgEntities,
  useOrgProfile,
  useOrgSettingsMutations,
  useOrgTeam,
  useUserMemberships,
} from "./use-org-settings";

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client }, children);
  };
}

function createWrapperWithClient(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client }, children);
  };
}

describe("org settings hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retains a checkout attempt across an error retry and clears it after success", async () => {
    mockBillingCheckoutPost
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "temporary_failure" }), {
          status: 503,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockImplementation(
        async () =>
          new Response(JSON.stringify({ url: "https://checkout.stripe.test/session" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
      );
    const { result } = renderHook(() => useBillingCheckoutMutation(), {
      wrapper: createWrapper(),
    });
    const payload = {
      planTier: "growth" as const,
      billingCycle: "annual" as const,
      promoCode: "SAVE20",
      surface: "paywall" as const,
    };

    await expect(result.current.mutateAsync(payload)).rejects.toThrow();
    await expect(result.current.mutateAsync(payload)).resolves.toMatchObject({
      url: "https://checkout.stripe.test/session",
    });
    await expect(result.current.mutateAsync(payload)).resolves.toMatchObject({
      url: "https://checkout.stripe.test/session",
    });

    const attemptIds = mockBillingCheckoutPost.mock.calls.map(
      ([request]) => request.json.checkoutAttemptId,
    );
    expect(attemptIds[1]).toBe(attemptIds[0]);
    expect(attemptIds[2]).not.toBe(attemptIds[1]);
  });

  it("rotates the checkout attempt when the serialized billing payload changes", async () => {
    mockBillingCheckoutPost
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "temporary_failure" }), {
          status: 503,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ url: "https://checkout.stripe.test/session" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    const { result } = renderHook(() => useBillingCheckoutMutation(), {
      wrapper: createWrapper(),
    });

    await expect(
      result.current.mutateAsync({
        planTier: "growth",
        billingCycle: "annual",
        promoCode: "SAVE20",
        surface: "paywall",
      }),
    ).rejects.toThrow();
    await expect(
      result.current.mutateAsync({
        planTier: "growth",
        billingCycle: "monthly",
        promoCode: "SAVE20",
        surface: "paywall",
      }),
    ).resolves.toMatchObject({ url: "https://checkout.stripe.test/session" });

    const attemptIds = mockBillingCheckoutPost.mock.calls.map(
      ([request]) => request.json.checkoutAttemptId,
    );
    expect(attemptIds[1]).not.toBe(attemptIds[0]);
  });

  it("loads org profile, team, billing, and debug data", async () => {
    mockProfileGet.mockResolvedValue(
      new Response(JSON.stringify({ id: "org-1", name: "GrantPipe Foundation" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    mockTeamGet.mockResolvedValue(
      new Response(JSON.stringify([{ id: "member-1", role: "admin" }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    mockBillingGet.mockResolvedValue(
      new Response(JSON.stringify({ planTier: "starter", status: "active" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    mockDebugEmailsGet.mockResolvedValue(
      new Response(JSON.stringify({ data: [], total: 0, page: 1, pageSize: 25 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    mockDebugStorageGet.mockResolvedValue(
      new Response(JSON.stringify({ data: [], total: 0, page: 1, pageSize: 25 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    mockDebugBillingGet.mockResolvedValue(
      new Response(JSON.stringify({ data: [], total: 0, page: 1, pageSize: 25 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    mockDebugAnalyticsGet.mockResolvedValue(
      new Response(JSON.stringify({ data: [], total: 1, page: 1, pageSize: 25 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    mockDebugErrorsGet.mockResolvedValue(
      new Response(JSON.stringify({ data: [], total: 2, page: 1, pageSize: 25 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const wrapper = createWrapper();
    const profile = renderHook(() => useOrgProfile(), { wrapper });
    const team = renderHook(() => useOrgTeam(), { wrapper });
    const billing = renderHook(() => useOrgBilling(), { wrapper });
    const debug = renderHook(() => useOrgDebugData(), { wrapper });

    await waitFor(() => {
      expect(profile.result.current.isSuccess).toBe(true);
      expect(team.result.current.isSuccess).toBe(true);
      expect(billing.result.current.isSuccess).toBe(true);
      expect(debug.result.current.emails.isSuccess).toBe(true);
      expect(debug.result.current.analytics.isSuccess).toBe(true);
      expect(debug.result.current.errors.isSuccess).toBe(true);
    });

    expect(profile.result.current.data?.name).toBe("GrantPipe Foundation");
    expect(team.result.current.data?.[0]?.role).toBe("admin");
    expect(billing.result.current.data?.planTier).toBe("starter");
    expect(debug.result.current.analytics.data?.total).toBe(1);
    expect(debug.result.current.errors.data?.total).toBe(2);
  });

  it("loads active org entities by default", async () => {
    mockEntitiesGet.mockResolvedValue(
      new Response(
        JSON.stringify({
          defaultEntityId: "entity-1",
          data: [
            {
              id: "entity-1",
              name: "Default Entity",
              kind: "root",
              status: "active",
              fiscalSponsorModel: "none",
              parentEntityId: null,
              isDefault: true,
            },
          ],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );

    const { result } = renderHook(() => useOrgEntities(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockEntitiesGet).toHaveBeenCalledWith({ query: { includeArchived: "false" } });
    expect(result.current.data?.defaultEntityId).toBe("entity-1");
    expect(result.current.data?.data[0]?.name).toBe("Default Entity");
  });

  it("runs org settings mutations", async () => {
    mockProfilePatch.mockResolvedValue(
      new Response(JSON.stringify({ id: "org-1", name: "GrantPipe+" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    mockInvitePost.mockResolvedValue(
      new Response(JSON.stringify({ id: "invite-1", token: "token-1" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );
    mockMemberPatch.mockImplementation(async () => {
      return new Response(JSON.stringify({ id: "member-1", role: "editor" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    mockBillingCheckoutPost.mockResolvedValue(
      new Response(JSON.stringify({ url: "/settings?checkout=1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    mockBillingSelectionPatch.mockResolvedValue(
      new Response(JSON.stringify({ id: "org-1", name: "GrantPipe+" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    mockBillingPortalPost.mockResolvedValue(
      new Response(JSON.stringify({ url: "/settings?portal=1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const { result } = renderHook(() => useOrgSettingsMutations(), { wrapper: createWrapper() });

    await expect(
      result.current.updateProfile.mutateAsync({
        name: "GrantPipe+",
        fiscalYearStartMonth: 1,
        timezone: "America/New_York",
        ein: "12-3456789",
        logoUrl: "https://cdn.example.org/logo.png",
        address: "123 Main St",
      }),
    ).resolves.toMatchObject({ name: "GrantPipe+" });
    expect(mockCaptureEvent).toHaveBeenCalledWith("org_profile_updated", {
      fiscal_year_start_month_changed: true,
      has_address: true,
      has_ein: true,
      has_logo: true,
      timezone_changed: true,
    });
    await expect(
      result.current.createInvite.mutateAsync({
        mode: "email",
        email: "person@example.org",
        role: "auditor",
        permissions: { donors: "none", grants: "view" },
      }),
    ).resolves.toMatchObject({
      token: "token-1",
    });
    expect(mockCaptureEvent).toHaveBeenCalledWith("invite_created", {
      invite_mode: "email",
      permission_override_count: 2,
      role: "auditor",
    });
    await expect(
      result.current.updateMember.mutateAsync({ memberId: "member-1", data: { role: "editor" } }),
    ).resolves.toMatchObject({ role: "editor" });
    expect(mockCaptureEvent).toHaveBeenCalledWith("org_member_updated", {
      action: "role_changed",
      permission_override_count: 0,
      role: "editor",
    });
    await expect(
      result.current.updateMember.mutateAsync({
        memberId: "member-1",
        data: { active: false, permissions: { donors: "view" } },
      }),
    ).resolves.toMatchObject({ role: "editor" });
    expect(mockCaptureEvent).toHaveBeenCalledWith("org_member_updated", {
      action: "deactivated",
      active: false,
      permission_override_count: 1,
    });
    await expect(
      result.current.startCheckout.mutateAsync({ planTier: "growth" }),
    ).resolves.toMatchObject({ url: "/settings?checkout=1" });
    expect(mockBillingCheckoutPost).toHaveBeenCalledWith({
      json: expect.objectContaining({
        planTier: "growth",
        checkoutAttemptId: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        ),
      }),
    });
    expect(mockCaptureEvent).toHaveBeenCalledWith("checkout_started", {
      plan_tier: "growth",
      billing_cycle: "unspecified",
      billing_surface: "settings",
      promo_code_applied: false,
      has_checkout_url: true,
    });
    await expect(
      result.current.saveBillingSelection.mutateAsync({
        planTier: "growth",
        billingCycle: "annual",
      }),
    ).resolves.toMatchObject({ name: "GrantPipe+" });
    expect(mockCaptureEvent).toHaveBeenCalledWith("plan_selected", {
      plan_tier: "growth",
      billing_cycle: "annual",
      billing_surface: "settings",
      promo_code_applied: false,
    });
    expect(mockCaptureEvent).toHaveBeenCalledWith("billing_selection_saved", {
      plan_tier: "growth",
      billing_cycle: "annual",
      billing_surface: "settings",
      promo_code_applied: false,
    });
    await expect(
      result.current.openPortal.mutateAsync({ returnPath: "/settings/billing" }),
    ).resolves.toMatchObject({ url: "/settings?portal=1" });
    expect(mockCaptureEvent).toHaveBeenCalledWith("billing_portal_opened", {
      return_path: "/settings/billing",
      has_portal_url: true,
    });
  });

  it("runs entity access mutations with safe analytics", async () => {
    mockEntityAccessPost.mockResolvedValue(
      new Response(JSON.stringify({ id: "entity-member-1", role: "viewer" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );
    mockEntityAccessPatch.mockResolvedValue(
      new Response(JSON.stringify({ id: "entity-member-1", role: "editor" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    mockEntityAccessDelete.mockResolvedValue(
      new Response(JSON.stringify({ id: "entity-member-1", role: "editor" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const { result } = renderHook(() => useOrgSettingsMutations(), { wrapper: createWrapper() });

    await expect(
      result.current.assignEntityAccess.mutateAsync({
        memberId: "member-1",
        data: {
          entityId: "entity-client",
          role: "viewer",
          permissions: { grants: "view" },
        },
      }),
    ).resolves.toMatchObject({ id: "entity-member-1" });
    expect(mockEntityAccessPost).toHaveBeenCalledWith({
      param: { memberId: "member-1" },
      json: {
        entityId: "entity-client",
        role: "viewer",
        permissions: { grants: "view" },
      },
    });
    expect(mockCaptureEvent).toHaveBeenCalledWith("org_member_updated", {
      action: "entity_access_assigned",
      entity_id: "entity-client",
      permission_override_count: 1,
      role: "viewer",
    });

    await expect(
      result.current.updateEntityAccess.mutateAsync({
        memberId: "member-1",
        entityId: "entity-client",
        data: { role: "editor" },
      }),
    ).resolves.toMatchObject({ role: "editor" });
    expect(mockEntityAccessPatch).toHaveBeenCalledWith({
      param: { memberId: "member-1", entityId: "entity-client" },
      json: { role: "editor" },
    });
    expect(mockCaptureEvent).toHaveBeenCalledWith("org_member_updated", {
      action: "entity_access_updated",
      entity_id: "entity-client",
      permission_override_count: 0,
      role: "editor",
    });

    await expect(
      result.current.revokeEntityAccess.mutateAsync({
        memberId: "member-1",
        entityId: "entity-client",
      }),
    ).resolves.toMatchObject({ id: "entity-member-1" });
    expect(mockEntityAccessDelete).toHaveBeenCalledWith({
      param: { memberId: "member-1", entityId: "entity-client" },
    });
    expect(mockCaptureEvent).toHaveBeenCalledWith("org_member_updated", {
      action: "entity_access_revoked",
      entity_id: "entity-client",
      permission_override_count: 0,
    });
  });

  it("runs entity mutations with sanitized analytics and cache invalidation", async () => {
    mockEntitiesPost.mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "entity-2",
          name: "Sponsored Project",
          kind: "sponsored_project",
          status: "active",
          fiscalSponsorModel: "model_a",
          parentEntityId: "entity-1",
          isDefault: false,
        }),
        {
          status: 201,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    mockEntityPatch.mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "entity-2",
          name: "Updated Project",
          kind: "sponsored_project",
          status: "active",
          fiscalSponsorModel: "model_c",
          parentEntityId: "entity-1",
          isDefault: false,
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    mockEntityArchivePost.mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "entity-2",
          name: "Updated Project",
          kind: "sponsored_project",
          status: "archived",
          fiscalSponsorModel: "model_c",
          parentEntityId: "entity-1",
          isDefault: false,
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    const { result } = renderHook(() => useOrgSettingsMutations(), {
      wrapper: createWrapperWithClient(client),
    });

    await expect(
      result.current.createEntity.mutateAsync({
        name: "Sponsored Project",
        kind: "sponsored_project",
        fiscalSponsorModel: "model_a",
        parentEntityId: "entity-1",
      }),
    ).resolves.toMatchObject({ id: "entity-2" });
    expect(mockCaptureEvent).toHaveBeenCalledWith("entity_created", {
      entity_id: "entity-2",
      entity_kind: "sponsored_project",
      fiscal_sponsor_model: "model_a",
      has_parent_entity: true,
    });

    await expect(
      result.current.updateEntity.mutateAsync({
        entityId: "entity-2",
        data: { name: "Updated Project", fiscalSponsorModel: "model_c" },
      }),
    ).resolves.toMatchObject({ id: "entity-2" });
    expect(mockCaptureEvent).toHaveBeenCalledWith("entity_updated", {
      entity_id: "entity-2",
      changed_fields: ["fiscalSponsorModel", "name"],
    });

    await expect(
      result.current.archiveEntity.mutateAsync({ entityId: "entity-2" }),
    ).resolves.toMatchObject({ status: "archived" });
    expect(mockCaptureEvent).toHaveBeenCalledWith("entity_archived", {
      entity_id: "entity-2",
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["org-entities"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["auth-session-context"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["user-memberships"] });
    expect(JSON.stringify(mockCaptureEvent.mock.calls)).not.toContain("Sponsored Project");
  });

  it("captures entity mutation failures in Sentry with safe metadata", async () => {
    mockEntitiesPost.mockRejectedValueOnce(new Error("network down"));
    mockEntityPatch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Update denied" }), {
        status: 403,
        headers: { "content-type": "application/json" },
      }),
    );
    mockEntityArchivePost.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Archive denied" }), {
        status: 409,
        headers: { "content-type": "application/json" },
      }),
    );

    const { result } = renderHook(() => useOrgSettingsMutations(), {
      wrapper: createWrapper(),
    });

    await expect(
      result.current.createEntity.mutateAsync({
        name: "Sensitive Entity Name",
        kind: "legal_entity",
        fiscalSponsorModel: "none",
        parentEntityId: null,
      }),
    ).rejects.toThrow("network down");
    await expect(
      result.current.updateEntity.mutateAsync({
        entityId: "entity-2",
        data: { name: "Sensitive Entity Name" },
      }),
    ).rejects.toThrow("Update denied");
    await expect(
      result.current.archiveEntity.mutateAsync({ entityId: "entity-2" }),
    ).rejects.toThrow("Archive denied");

    expect(mockCaptureAppException).toHaveBeenCalledWith(
      expect.any(Error),
      {
        tags: {
          feature: "entity_settings",
          operation: "create",
        },
        extra: {
          entity_kind: "legal_entity",
          fiscal_sponsor_model: "none",
          has_parent_entity: false,
        },
      },
      { sanitize: true },
    );
    expect(mockCaptureAppException).toHaveBeenCalledWith(
      expect.any(Error),
      {
        tags: {
          feature: "entity_settings",
          operation: "update",
        },
        extra: {
          entity_id: "entity-2",
          changed_fields: ["name"],
        },
      },
      { sanitize: true },
    );
    expect(mockCaptureAppException).toHaveBeenCalledWith(
      expect.any(Error),
      {
        tags: {
          feature: "entity_settings",
          operation: "archive",
        },
        extra: {
          entity_id: "entity-2",
        },
      },
      { sanitize: true },
    );
    expect(JSON.stringify(mockCaptureAppException.mock.calls)).not.toContain(
      "Sensitive Entity Name",
    );
  });

  it("derives permissions_changed and member_updated member actions", async () => {
    mockMemberPatch.mockImplementation(async () => {
      return new Response(JSON.stringify({ id: "member-1", role: "editor" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const { result } = renderHook(() => useOrgSettingsMutations(), { wrapper: createWrapper() });

    await expect(
      result.current.updateMember.mutateAsync({
        memberId: "member-1",
        data: { permissions: { donors: "view" } },
      }),
    ).resolves.toMatchObject({ role: "editor" });
    expect(mockCaptureEvent).toHaveBeenCalledWith("org_member_updated", {
      action: "permissions_changed",
      permission_override_count: 1,
    });

    await expect(
      result.current.updateMember.mutateAsync({ memberId: "member-1", data: {} }),
    ).resolves.toMatchObject({ role: "editor" });
    expect(mockCaptureEvent).toHaveBeenCalledWith("org_member_updated", {
      action: "member_updated",
      permission_override_count: 0,
    });

    await expect(
      result.current.updateMember.mutateAsync({ memberId: "member-1", data: { active: true } }),
    ).resolves.toMatchObject({ role: "editor" });
    expect(mockCaptureEvent).toHaveBeenCalledWith("org_member_updated", {
      action: "reactivated",
      active: true,
      permission_override_count: 0,
    });
  });

  it("defaults invite mode to shareable when mode is omitted", async () => {
    mockInvitePost.mockResolvedValue(
      new Response(JSON.stringify({ id: "invite-2", token: "token-2" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );

    const { result } = renderHook(() => useOrgSettingsMutations(), { wrapper: createWrapper() });

    await expect(
      result.current.createInvite.mutateAsync({ role: "viewer" }),
    ).resolves.toMatchObject({ token: "token-2" });
    expect(mockCaptureEvent).toHaveBeenCalledWith("invite_created", {
      invite_mode: "shareable",
      permission_override_count: 0,
      role: "viewer",
    });
  });

  it("keeps the cached billing cycle when plan selection omits one and clears null auth cache", async () => {
    mockBillingSelectionPatch.mockResolvedValue(
      new Response(JSON.stringify({ id: "org-1", name: "GrantPipe+" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    client.setQueryData(["org-billing"], {
      planTier: "starter",
      billingCycle: "monthly",
      status: "trialing",
    });
    client.setQueryData(["auth-session-context"], null);

    const { result } = renderHook(
      () => {
        const queryClient = useQueryClient();
        return { queryClient, mutations: useOrgSettingsMutations() };
      },
      { wrapper: createWrapperWithClient(client) },
    );

    await result.current.mutations.saveBillingSelection.mutateAsync({ planTier: "growth" });

    expect(result.current.queryClient.getQueryData(["org-billing"])).toMatchObject({
      planTier: "growth",
      billingCycle: "monthly",
    });
    expect(result.current.queryClient.getQueryData(["auth-session-context"])).toBeNull();
  });

  it("patches plan selection into auth and billing caches before invalidating", async () => {
    mockBillingSelectionPatch.mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "org-1",
          name: "GrantPipe+",
          planTier: "growth",
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    client.setQueryData(["org-billing"], {
      planTier: "starter",
      billingCycle: "monthly",
      status: "trialing",
    });
    client.setQueryData(["auth-session-context", "user-1"], {
      planSelectionCompleted: false,
      onboardingCompleted: false,
      orgSubscription: {
        planTier: "starter",
        subscriptionStatus: "trialing",
        trialEndsAt: null,
        onboardingCompleted: false,
        planSelectedAt: null,
        stripeSubscriptionId: null,
      },
    });

    const { result } = renderHook(
      () => {
        const queryClient = useQueryClient();
        return {
          queryClient,
          mutations: useOrgSettingsMutations(),
        };
      },
      { wrapper: createWrapperWithClient(client) },
    );

    await result.current.mutations.saveBillingSelection.mutateAsync({
      planTier: "growth",
      billingCycle: "annual",
    });

    expect(result.current.queryClient.getQueryData(["org-billing"])).toMatchObject({
      planTier: "growth",
      billingCycle: "annual",
    });
    expect(
      result.current.queryClient.getQueryData(["auth-session-context", "user-1"]),
    ).toMatchObject({
      planSelectionCompleted: true,
      orgSubscription: expect.objectContaining({
        planTier: "growth",
        planSelectedAt: expect.any(String),
      }),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["auth-session-context"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["org-billing"] });
  });

  it("refreshes the dashboard overview after the org profile is updated", async () => {
    mockProfilePatch.mockResolvedValue(
      new Response(JSON.stringify({ id: "org-1", name: "GrantPipe+", fiscalYearStartMonth: 7 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    const { result } = renderHook(() => useOrgSettingsMutations(), {
      wrapper: createWrapperWithClient(client),
    });

    await result.current.updateProfile.mutateAsync({
      name: "GrantPipe+",
      fiscalYearStartMonth: 7,
      timezone: "America/New_York",
      ein: "12-3456789",
      logoUrl: "https://cdn.example.org/logo.png",
      address: "123 Main St",
    });

    // Changing fiscalYearStartMonth shifts the dashboard's this-FY / prior-FY
    // donor metrics, so the dashboard overview query must be invalidated.
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["dashboard-overview"] });
  });

  it("patches plan selection when cached subscription details are missing", async () => {
    mockBillingSelectionPatch.mockResolvedValue(
      new Response(JSON.stringify({ id: "org-1", name: "GrantPipe+" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    client.setQueryData(["auth-session-context", "user-1"], {
      planSelectionCompleted: false,
    });

    const { result } = renderHook(
      () => {
        const queryClient = useQueryClient();
        return {
          queryClient,
          mutations: useOrgSettingsMutations(),
        };
      },
      { wrapper: createWrapperWithClient(client) },
    );

    await result.current.mutations.saveBillingSelection.mutateAsync({
      planTier: "growth",
    });

    expect(result.current.queryClient.getQueryData(["org-billing"])).toBeUndefined();
    expect(
      result.current.queryClient.getQueryData(["auth-session-context", "user-1"]),
    ).toMatchObject({
      planSelectionCompleted: true,
      orgSubscription: expect.objectContaining({
        subscriptionStatus: "trialing",
        trialEndsAt: null,
        onboardingCompleted: false,
        stripeSubscriptionId: null,
        planTier: "growth",
        effectivePlanTier: "growth",
        planSelectedAt: expect.any(String),
      }),
    });
  });

  it("does not create auth session cache entries during plan selection", async () => {
    mockBillingSelectionPatch.mockResolvedValue(
      new Response(JSON.stringify({ id: "org-1", name: "GrantPipe+" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    const { result } = renderHook(
      () => {
        const queryClient = useQueryClient();
        return {
          queryClient,
          mutations: useOrgSettingsMutations(),
        };
      },
      { wrapper: createWrapperWithClient(client) },
    );

    await result.current.mutations.saveBillingSelection.mutateAsync({
      planTier: "growth",
    });

    expect(result.current.queryClient.getQueryData(["auth-session-context"])).toBeUndefined();
  });

  it("surfaces request parsing and response errors", async () => {
    mockProfileGet.mockResolvedValue(
      new Response("not-json", {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    mockProfilePatch.mockResolvedValue(
      new Response("Plain failure", {
        status: 500,
        headers: { "content-type": "text/plain" },
      }),
    );
    mockInvitePost.mockResolvedValue(
      new Response("not-json", {
        status: 500,
        headers: { "content-type": "application/json" },
      }),
    );
    mockMemberPatch.mockResolvedValue(
      new Response(JSON.stringify({ error: "Role update denied" }), {
        status: 403,
        headers: { "content-type": "application/json" },
      }),
    );
    mockBillingCheckoutPost.mockResolvedValue({
      ok: false,
      headers: { get: () => null },
      text: vi.fn().mockRejectedValue(new Error("text failed")),
    } as never);
    mockBillingSelectionPatch.mockResolvedValue(
      new Response(JSON.stringify({ error: "Selection update denied" }), {
        status: 403,
        headers: { "content-type": "application/json" },
      }),
    );
    mockBillingPortalPost.mockRejectedValue(new Error("offline"));

    const profile = renderHook(() => useOrgProfile(), { wrapper: createWrapper() });
    const mutations = renderHook(() => useOrgSettingsMutations(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(profile.result.current.isError).toBe(true);
    });

    await expect(
      mutations.result.current.updateProfile.mutateAsync({
        name: "GrantPipe+",
        fiscalYearStartMonth: 1,
        timezone: "America/New_York",
      }),
    ).rejects.toThrow("Plain failure");

    await expect(
      mutations.result.current.createInvite.mutateAsync({ role: "viewer" }),
    ).rejects.toThrow("Request failed");
    await expect(
      mutations.result.current.updateMember.mutateAsync({
        memberId: "member-1",
        data: { role: "editor" },
      }),
    ).rejects.toThrow("Role update denied");
    await expect(
      mutations.result.current.startCheckout.mutateAsync({ planTier: "growth" }),
    ).rejects.toThrow("Request failed");
    expect(mockCaptureEvent).toHaveBeenCalledWith("checkout_start_failed", {
      plan_tier: "growth",
      billing_cycle: "unspecified",
      billing_surface: "settings",
      promo_code_applied: false,
      failure_type: "api_error",
    });
    expect(mockCaptureAppException).toHaveBeenCalledWith(
      expect.any(Error),
      {
        tags: {
          feature: "billing",
          operation: "checkout_start",
          surface: "settings",
        },
        extra: {
          plan_tier: "growth",
          billing_cycle: "unspecified",
          billing_surface: "settings",
          promo_code_applied: false,
        },
      },
      { sanitize: true },
    );
    await expect(
      mutations.result.current.saveBillingSelection.mutateAsync({ planTier: "growth" }),
    ).rejects.toThrow("Selection update denied");
    expect(mockCaptureEvent).toHaveBeenCalledWith("plan_selection_failed", {
      plan_tier: "growth",
      billing_cycle: "unspecified",
      billing_surface: "settings",
      promo_code_applied: false,
      failure_type: "api_error",
    });
    await expect(
      mutations.result.current.openPortal.mutateAsync({ returnPath: "/settings/billing" }),
    ).rejects.toThrow("offline");
    expect(mockCaptureEvent).toHaveBeenCalledWith("billing_portal_failed", {
      return_path: "/settings/billing",
      failure_type: "unknown_error",
    });
  });

  it("treats empty success payloads as errors", async () => {
    mockProfileGet.mockResolvedValue(
      new Response("", {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const profile = renderHook(() => useOrgProfile(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(profile.result.current.isError).toBe(true);
    });

    expect(profile.result.current.error).toEqual(new Error("Request returned no data"));
  });

  it("surfaces message field from JSON error body", async () => {
    mockProfileGet.mockResolvedValue(
      new Response(JSON.stringify({ message: "org not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      }),
    );
    const profile = renderHook(() => useOrgProfile(), { wrapper: createWrapper() });
    await waitFor(() => expect(profile.result.current.isError).toBe(true));
    expect(profile.result.current.error?.message).toBe("org not found");
  });

  it("falls back to Request failed for non-OK JSON with no error or message field", async () => {
    mockProfileGet.mockResolvedValue(
      new Response(JSON.stringify({ code: 500 }), {
        status: 500,
        headers: { "content-type": "application/json" },
      }),
    );
    const profile = renderHook(() => useOrgProfile(), { wrapper: createWrapper() });
    await waitFor(() => expect(profile.result.current.isError).toBe(true));
    expect(profile.result.current.error?.message).toBe("Request failed");
  });

  it("falls back to Request failed when plain text body is whitespace-only", async () => {
    mockProfileGet.mockResolvedValue(
      new Response("   ", {
        status: 500,
        headers: { "content-type": "text/plain" },
      }),
    );
    const profile = renderHook(() => useOrgProfile(), { wrapper: createWrapper() });
    await waitFor(() => expect(profile.result.current.isError).toBe(true));
    expect(profile.result.current.error?.message).toBe("Request failed");
  });

  it("falls back to generic error when JSON parse fails on a success response", async () => {
    mockProfileGet.mockResolvedValue({
      ok: false,
      headers: { get: () => "text/plain" },
      json: vi.fn(),
      text: vi.fn().mockRejectedValue(new Error("bad read")),
    });
    const profile = renderHook(() => useOrgProfile(), { wrapper: createWrapper() });
    await waitFor(() => expect(profile.result.current.isError).toBe(true));
    expect(profile.result.current.error?.message).toBe("Request failed");
  });
});

describe("options?.enabled branches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("useOrgProfile respects enabled: false (covers options?.enabled non-null branch)", () => {
    const { result } = renderHook(() => useOrgProfile({ enabled: false }), {
      wrapper: createWrapper(),
    });
    expect(result.current.fetchStatus).toBe("idle");
    expect(mockProfileGet).not.toHaveBeenCalled();
  });

  it("useOrgTeam respects enabled: false (covers options?.enabled non-null branch)", () => {
    const { result } = renderHook(() => useOrgTeam({ enabled: false }), {
      wrapper: createWrapper(),
    });
    expect(result.current.fetchStatus).toBe("idle");
    expect(mockTeamGet).not.toHaveBeenCalled();
  });

  it("useOrgBilling respects enabled: false (covers options?.enabled non-null branch)", () => {
    const { result } = renderHook(() => useOrgBilling({ enabled: false }), {
      wrapper: createWrapper(),
    });
    expect(result.current.fetchStatus).toBe("idle");
    expect(mockBillingGet).not.toHaveBeenCalled();
  });

  it("useOrgEntities respects enabled: false and archived query options", async () => {
    const disabled = renderHook(() => useOrgEntities({ enabled: false }), {
      wrapper: createWrapper(),
    });
    expect(disabled.result.current.fetchStatus).toBe("idle");
    expect(mockEntitiesGet).not.toHaveBeenCalled();

    mockEntitiesGet.mockResolvedValue(
      new Response(JSON.stringify({ defaultEntityId: null, data: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const enabled = renderHook(() => useOrgEntities({ includeArchived: true }), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(enabled.result.current.isSuccess).toBe(true));
    expect(mockEntitiesGet).toHaveBeenCalledWith({ query: { includeArchived: "true" } });
  });

  it("useOrgDebugData respects enabled: false (covers useDebugQuery options?.enabled non-null branch)", () => {
    const { result } = renderHook(() => useOrgDebugData({ enabled: false }), {
      wrapper: createWrapper(),
    });
    expect(result.current.emails.fetchStatus).toBe("idle");
    expect(mockDebugEmailsGet).not.toHaveBeenCalled();
  });
});

describe("useUserMemberships", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches the list of org memberships", async () => {
    const membershipData = {
      data: [
        {
          orgId: "org-1",
          orgName: "Foundation Alpha",
          role: "admin",
          entityAccess: [
            {
              entityId: "entity-1",
              entityName: "Foundation Alpha",
              kind: "root",
              status: "active",
              fiscalSponsorModel: "none",
              parentEntityId: null,
              role: "admin",
              permissions: {
                entitySettings: "manage",
                entityTeam: "manage",
                grants: "manage",
                funds: "manage",
                documents: "manage",
                compliance: "manage",
                accounting: "manage",
                reports: "manage",
              },
            },
          ],
        },
        { orgId: "org-2", orgName: "Fund Beta", role: "editor", entityAccess: [] },
      ],
    };
    mockMembershipsGet.mockResolvedValue(
      new Response(JSON.stringify(membershipData), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const { result } = renderHook(() => useUserMemberships(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.data).toHaveLength(2);
    expect(result.current.data?.data[0]?.orgName).toBe("Foundation Alpha");
    expect(result.current.data?.data[0]?.entityAccess).toHaveLength(1);
    expect(result.current.data?.data[0]?.entityAccess[0]?.entityName).toBe("Foundation Alpha");
    expect(result.current.data?.data[1]?.role).toBe("editor");
    expect(result.current.data?.data[1]?.entityAccess).toEqual([]);
  });

  it("respects the enabled option", () => {
    const { result } = renderHook(() => useUserMemberships({ enabled: false }), {
      wrapper: createWrapper(),
    });
    expect(result.current.fetchStatus).toBe("idle");
    expect(mockMembershipsGet).not.toHaveBeenCalled();
  });

  it("surfaces errors from the memberships endpoint", async () => {
    mockMembershipsGet.mockResolvedValue(
      new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    );

    const { result } = renderHook(() => useUserMemberships(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("Unauthorized");
  });
});
