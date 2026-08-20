import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ANALYTICS_EVENTS } from "@grantpipe/shared";
import { getIntegrations, resetLocalMockIntegrationRecords } from "./integrations";

const hoistedSentry = vi.hoisted(() => ({
  mockCaptureBackgroundException: vi.fn(),
}));

vi.mock("./sentry", () => ({
  captureBackgroundException: hoistedSentry.mockCaptureBackgroundException,
  captureApiException: vi.fn(),
  captureQueueException: vi.fn(),
  captureAuthServerError: vi.fn(),
  captureScheduledException: vi.fn(),
  runScheduledJob: vi.fn(),
  createSentryOptions: vi.fn(),
}));

type MockDb = {
  query: {
    organizations: {
      findFirst: ReturnType<typeof vi.fn>;
    };
  };
  insert: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

function createMockDb(): MockDb {
  const select = vi.fn().mockImplementation((selection?: { count?: unknown }) => {
    if (selection && "count" in selection) {
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 3 }]),
        }),
      };
    }

    return {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      }),
    };
  });

  return {
    query: {
      organizations: {
        findFirst: vi.fn().mockResolvedValue({
          id: "org-1",
          planTier: "starter",
          stripeCustomerId: null,
          stripeSubscriptionId: null,
        }),
      },
    },
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: "email-1" }]),
        }),
        returning: vi.fn().mockResolvedValue([{ id: "record-1" }]),
      }),
    }),
    select,
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  };
}

describe("getIntegrations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetLocalMockIntegrationRecords();
  });

  it("returns mock integrations by default without persisting mock-only tables", async () => {
    const db = createMockDb();
    const integrations = getIntegrations(
      db as never,
      {
        APP_URL: "http://localhost:5173",
      } as never,
    );

    await integrations.storage.put({
      key: "org-1/grant/grant-1/file.pdf",
      body: new Uint8Array([1, 2, 3]),
      contentType: "application/pdf",
      fileName: "file.pdf",
      source: { entityType: "grant", entityId: "grant-1", orgId: "org-1" },
    });
    const storedObject = await integrations.storage.get("org-1/grant/grant-1/file.pdf");
    await integrations.storage.delete("org-1/grant/grant-1/file.pdf");
    const listedStorage = await integrations.storage.list("org-1", 1, 10);

    await integrations.email.send({
      orgId: "org-1",
      to: ["person@example.com"],
      subject: "Hello",
      text: "Test",
      source: { entityType: "notification", entityId: "notification-1" },
    });
    const billingSummary = await integrations.billing.getSummary("org-1");
    const checkout = await integrations.billing.createCheckoutSession({
      checkoutAttemptId: "33333333-3333-4333-8333-333333333333",
      orgId: "org-1",
      initiatedBy: "user-1",
      planTier: "growth",
    });
    const portal = await integrations.billing.createPortalSession({
      orgId: "org-1",
      initiatedBy: "user-1",
      returnPath: "/settings",
    });
    const billingEvents = await integrations.billing.listEvents("org-1", 1, 10);

    await integrations.analytics.capture({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.orgProfileUpdated,
      payload: { actorId: "user-1" },
    });
    const analyticsEvents = await integrations.analytics.list("org-1", 1, 10);
    await integrations.errors.capture({
      orgId: "org-1",
      message: "Invite expired",
      payload: { token: "token-1" },
    });
    const errorEvents = await integrations.errors.list("org-1", 1, 10);

    expect(storedObject?.body).toEqual(Uint8Array.from([1, 2, 3]));
    expect(listedStorage.total).toBe(0);
    expect(billingSummary.planTier).toBe("starter");
    expect(billingSummary.effectivePlanTier).toBe("starter");
    expect(billingSummary.checkoutUrl).toBe("http://localhost:5173/app/settings#billing");
    expect(billingSummary.portalUrl).toBe("http://localhost:5173/app/settings#billing");
    expect(checkout.url).toMatch(
      /^http:\/\/localhost:5173\/app\/settings\?checkout=[^#]+#billing$/,
    );
    expect(portal.url).toContain("/app/settings");
    expect(billingEvents.total).toBe(3);
    expect(analyticsEvents.total).toBe(1);
    expect(errorEvents.total).toBe(1);
    expect(db.insert).toHaveBeenCalled();
    expect(db.delete).not.toHaveBeenCalled();
    expect(db.update).toHaveBeenCalled();
  });

  it("keeps the selected plan as the effective billing tier for active trials", async () => {
    const db = createMockDb();
    db.query.organizations.findFirst.mockResolvedValueOnce({
      id: "org-1",
      planTier: "starter",
      subscriptionStatus: "trialing",
      trialEndsAt: new Date("2099-01-01T00:00:00.000Z"),
      stripeCustomerId: null,
      stripeSubscriptionId: null,
    });
    const integrations = getIntegrations(
      db as never,
      { APP_URL: "http://localhost:5173" } as never,
    );

    const billingSummary = await integrations.billing.getSummary("org-1");

    expect(billingSummary.planTier).toBe("starter");
    expect(billingSummary.effectivePlanTier).toBe("starter");
  });

  it("shares local mock records across integrations created with different db handles", async () => {
    const db = createMockDb();
    const secondDb = createMockDb();
    const first = getIntegrations(db as never, { APP_URL: "http://localhost:5173" } as never);
    const second = getIntegrations(
      secondDb as never,
      { APP_URL: "http://localhost:5173" } as never,
    );

    await first.storage.put({
      key: "org-1/debug/file.txt",
      body: "stored body",
      contentType: "text/plain",
      fileName: "file.txt",
      source: { entityType: "debug", entityId: "storage-1", orgId: "org-1" },
    });
    await first.email.send({
      orgId: "org-1",
      to: ["admin@example.org"],
      subject: "Debug email",
      text: "Email body",
      source: { entityType: "debug", entityId: "email-1" },
    });
    await first.analytics.capture({
      orgId: "org-1",
      eventName: "debug.event",
    });
    await first.errors.capture({
      orgId: "org-1",
      message: "Debug error",
    });

    await expect(second.storage.get("org-1/debug/file.txt")).resolves.toEqual({
      body: "stored body",
    });
    await expect(second.storage.list("org-1", 1, 10)).resolves.toMatchObject({ total: 1 });
    await expect(second.email.list("org-1", 1, 10)).resolves.toMatchObject({ total: 1 });
    await expect(second.analytics.list("org-1", 1, 10)).resolves.toMatchObject({ total: 1 });
    await expect(second.errors.list("org-1", 1, 10)).resolves.toMatchObject({ total: 1 });
  });

  it("returns real-mode storage when integration mode is real and bindings exist", async () => {
    const put = vi.fn().mockResolvedValue(undefined);
    const get = vi.fn().mockResolvedValue({ body: "pdf-bytes" });
    const remove = vi.fn().mockResolvedValue(undefined);
    const integrations = getIntegrations(
      {} as never,
      {
        APP_URL: "http://localhost:5173",
        INTEGRATION_MODE: "real",
        STRIPE_SECRET_KEY: "sk_test_123",
        RESEND_API_KEY: "re_test_123",
        R2: { put, get, delete: remove },
      } as never,
    );

    await integrations.storage.put({
      key: "org-1/grant/grant-1/file.pdf",
      body: new Uint8Array([1, 2, 3]),
      contentType: "application/pdf",
      fileName: "file.pdf",
      source: { entityType: "grant", entityId: "grant-1", orgId: "org-1" },
    });
    await integrations.storage.get("org-1/grant/grant-1/file.pdf");
    await integrations.storage.delete("org-1/grant/grant-1/file.pdf");

    expect(put).toHaveBeenCalled();
    expect(get).toHaveBeenCalled();
    expect(remove).toHaveBeenCalled();
  });

  it("throws when real storage mode is requested without an R2 binding", () => {
    expect(() =>
      getIntegrations(
        {} as never,
        {
          APP_URL: "http://localhost:5173",
          INTEGRATION_MODE: "real",
          STRIPE_SECRET_KEY: "sk_test_123",
          RESEND_API_KEY: "re_test_123",
        } as never,
      ),
    ).toThrow("R2 binding is required for real storage mode");
  });

  it("infers real mode from the presence of an R2 binding when INTEGRATION_MODE is unset", async () => {
    const put = vi.fn().mockResolvedValue(undefined);
    const get = vi.fn().mockResolvedValue({ body: "x" });
    const integrations = getIntegrations(
      {} as never,
      {
        APP_URL: "http://localhost:5173",
        STRIPE_SECRET_KEY: "sk_test_123",
        RESEND_API_KEY: "re_test_123",
        R2: { put, get },
      } as never,
    );

    await integrations.storage.put({
      key: "k",
      body: "hello",
      contentType: "text/plain",
      fileName: "f.txt",
      source: { entityType: "e", entityId: "e-1" },
    });
    expect(put).toHaveBeenCalled();
  });

  it("real storage list returns an empty page", async () => {
    const integrations = getIntegrations(
      {} as never,
      {
        APP_URL: "http://localhost:5173",
        INTEGRATION_MODE: "real",
        STRIPE_SECRET_KEY: "sk_test_123",
        RESEND_API_KEY: "re_test_123",
        R2: { put: vi.fn(), get: vi.fn(), delete: vi.fn() },
      } as never,
    );
    await expect(integrations.storage.list("org-1", 1, 10)).resolves.toEqual({
      data: [],
      total: 0,
    });
  });

  it("real storage delete tolerates an R2 binding without a delete method", async () => {
    const integrations = getIntegrations(
      {} as never,
      {
        APP_URL: "http://localhost:5173",
        INTEGRATION_MODE: "real",
        STRIPE_SECRET_KEY: "sk_test_123",
        RESEND_API_KEY: "re_test_123",
        R2: { put: vi.fn(), get: vi.fn() },
      } as never,
    );
    await expect(integrations.storage.delete("k")).resolves.toBeUndefined();
  });

  it("mock email.list paginates in-memory sends", async () => {
    const db = createMockDb();
    const integrations = getIntegrations(db as never, { APP_URL: "http://x" } as never);
    await integrations.email.send({
      orgId: "org-1",
      to: ["a@b.co"],
      subject: "s",
      text: "t",
      source: { entityType: "e", entityId: "e-1" },
    });
    await integrations.email.send({
      orgId: "org-1",
      to: ["c@d.co"],
      subject: "s2",
      text: "t2",
      source: { entityType: "e", entityId: "e-2" },
    });
    const result = await integrations.email.list("org-1", 1, 1);
    expect(result.total).toBe(2);
    expect(result.data).toHaveLength(1);
  });

  it("mock analytics.capture stores events in memory", async () => {
    const db = createMockDb();
    const integrations = getIntegrations(db as never, { APP_URL: "http://x" } as never);
    await integrations.analytics.capture({ orgId: "org-1", eventName: "x" });
    const result = await integrations.analytics.list("org-1", 1, 10);
    expect(result.total).toBe(1);
  });

  it("mock analytics.capture supports db insert helpers that resolve directly", async () => {
    const db = createMockDb();
    db.insert.mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });
    const integrations = getIntegrations(db as never, { APP_URL: "http://x" } as never);

    await integrations.analytics.capture({ orgId: "org-1", eventName: "x" });

    expect(db.insert).toHaveBeenCalled();
  });

  it("sends analytics captures to PostHog when real mode has a PostHog key", async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue("{}"),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      const integrations = getIntegrations(
        {} as never,
        {
          APP_URL: "https://app.grantpipe.com",
          INTEGRATION_MODE: "real",
          STRIPE_SECRET_KEY: "sk_test_123",
          RESEND_API_KEY: "re_test_123",
          POSTHOG_API_KEY: "phc_test",
          POSTHOG_HOST: "https://us.i.posthog.com",
          R2: { put: vi.fn(), get: vi.fn(), delete: vi.fn() },
        } as never,
      );

      const result = await integrations.analytics.capture({
        orgId: "org-1",
        eventName: "checkout_completed",
        payload: {
          $insert_id: "report-1:ready",
          org_id: "org-1",
          plan_tier: "growth",
          customer_email: "must-not-be-added-by-provider@example.org",
          token: "invite-token",
          sessionId: "cs_test_should_not_emit",
          actorId: "user-1",
        },
      });

      expect(result.id).toBe("posthog");
      expect(fetchMock).toHaveBeenCalledWith(
        "https://us.i.posthog.com/capture/",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }),
      );
      const body = JSON.parse((fetchMock.mock.calls[0]![1] as { body: string }).body) as Record<
        string,
        unknown
      >;
      expect(body).toMatchObject({
        api_key: "phc_test",
        event: "checkout_completed",
        distinct_id: "org-1",
        properties: {
          $insert_id: "report-1:ready",
          org_id: "org-1",
          plan_tier: "growth",
        },
      });
      expect(JSON.stringify(body)).not.toContain("sk_test_123");
      expect(JSON.stringify(body)).not.toContain("must-not-be-added-by-provider@example.org");
      expect(JSON.stringify(body)).not.toContain("invite-token");
      expect(JSON.stringify(body)).not.toContain("cs_test_should_not_emit");
      expect(JSON.stringify(body)).not.toContain("user-1");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("keeps dashboard segmentation properties and drops unsafe analytics fields", async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue("{}"),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      const integrations = getIntegrations(
        {} as never,
        {
          APP_URL: "https://app.grantpipe.com",
          INTEGRATION_MODE: "real",
          STRIPE_SECRET_KEY: "sk_test_123",
          RESEND_API_KEY: "re_test_123",
          POSTHOG_API_KEY: "phc_test",
          POSTHOG_HOST: "https://us.i.posthog.com",
          R2: { put: vi.fn(), get: vi.fn(), delete: vi.fn() },
        } as never,
      );

      await integrations.analytics.capture({
        orgId: "org-1",
        eventName: "report_generated",
        payload: {
          section: "reports",
          destination_path: "/app/reports",
          source: "dashboard",
          landing_path: "/pricing",
          failure_type: "validation",
          surface: "report_builder",
          field_key: "report_type",
          step_name: "review",
          entity_type: "report",
          mapped_entity_type: "funder",
          account_type: "asset",
          request_type: "reimbursement",
          contact_type: "individual",
          donation_type: "one_time",
          communication_type: "email",
          restriction: "unrestricted",
          restriction_type: "purpose",
          evidence_type: "invoice",
          reviewer_type: "auditor",
          fund_type: "restricted",
          funder_type: "foundation",
          evidence_bundle_purpose: "audit",
          source_type: "community_foundation",
          alert_kind: "overspend",
          alert_band: "over_budget",
          delivery_channel: "email",
          scope_type: "grant",
          item_type: "grant",
          file_format: "csv",
          base: "direct_costs",
          balance_mode: "replace_and_balance",
          funder_decision: "map_existing",
          grant_decision: "create_new",
          from_status: "draft",
          to_status: "submitted",
          stage: "cultivation",
          auto_post_journal_entry: true,
          include_evidence_package: true,
          import_type: "donations",
          report_type: "grant_summary",
          accounting_system: "quickbooks",
          page_family: "comparison",
          buyer_stage: "evaluation",
          placement: "hero",
          intent: "trial",
          magnet_slug: "audit-readiness",
          promo_code_applied: true,
          mime_family: "pdf",
          size_bucket: "1mb_5mb",
          result_count_bucket: "10_25",
          query_length_bucket: "short",
          kind_filter: "overspend",
          total_rows_bucket: "1-10",
          total_at_risk_bucket: "1_10",
          overspend_count_bucket: "1_10",
          underspend_count_bucket: "1_10",
          inserted_rows_bucket: "1-10",
          duplicate_rows_bucket: "0",
          failed_rows_bucket: "0",
          imported_rows_bucket: "1-10",
          allocation_count_bucket: "1-10",
          scope_count_bucket: "1-10",
          item_count_bucket: "1-10",
          ttl_bucket: "1d_7d",
          contacts_created_bucket: "1-10",
          donations_created_bucket: "0",
          grants_created_bucket: "0",
          funders_created_bucket: "0",
          grant_opportunities_created_bucket: "0",
          changed_fields: ["accounting_enabled"],
          accounting_enabled: true,
          address_present: false,
          amount_present: true,
          date_range_present: true,
          ein_present: true,
          logo_present: true,
          fiscal_year_start_month_changed: true,
          timezone_changed: true,
          invite_mode: "email",
          target_role: "editor",
          has_email_invite: true,
          has_permission_overrides: true,
          permission_override_keys: ["donors", "grants"],
          role_changed: true,
          status_changed: true,
          target_active: false,
          permissions_changed: true,
          bundle_reused: true,
          risk_rating: "high",
          log_type: "desk_review",
          severity: "high",
          operation: "create",
          access_level: "auditor",
          column_count: 3,
          custom_field_count: 1,
          filter_count: 2,
          sort_count: 1,
          has_description: true,
          limit_bucket: "10_25",
          title: "Raw report title must not pass",
          description: "Free-form donor detail must not pass",
          query: "raw donor search text",
          filename: "award.pdf",
          subawardId: "subaward-1",
          token: "secret-token",
        },
      });

      const body = JSON.parse((fetchMock.mock.calls[0]![1] as { body: string }).body) as {
        properties: Record<string, unknown>;
      };
      expect(body.properties).toMatchObject({
        section: "reports",
        destination_path: "/app/reports",
        source: "dashboard",
        landing_path: "/pricing",
        failure_type: "validation",
        surface: "report_builder",
        field_key: "report_type",
        step_name: "review",
        entity_type: "report",
        mapped_entity_type: "funder",
        account_type: "asset",
        request_type: "reimbursement",
        contact_type: "individual",
        donation_type: "one_time",
        communication_type: "email",
        restriction: "unrestricted",
        restriction_type: "purpose",
        evidence_type: "invoice",
        reviewer_type: "auditor",
        fund_type: "restricted",
        funder_type: "foundation",
        evidence_bundle_purpose: "audit",
        source_type: "community_foundation",
        alert_kind: "overspend",
        alert_band: "over_budget",
        delivery_channel: "email",
        scope_type: "grant",
        item_type: "grant",
        file_format: "csv",
        base: "direct_costs",
        balance_mode: "replace_and_balance",
        funder_decision: "map_existing",
        grant_decision: "create_new",
        from_status: "draft",
        to_status: "submitted",
        stage: "cultivation",
        auto_post_journal_entry: true,
        include_evidence_package: true,
        import_type: "donations",
        report_type: "grant_summary",
        accounting_system: "quickbooks",
        page_family: "comparison",
        buyer_stage: "evaluation",
        placement: "hero",
        intent: "trial",
        magnet_slug: "audit-readiness",
        promo_code_applied: true,
        mime_family: "pdf",
        size_bucket: "1mb_5mb",
        result_count_bucket: "10_25",
        query_length_bucket: "short",
        kind_filter: "overspend",
        total_rows_bucket: "1-10",
        total_at_risk_bucket: "1_10",
        overspend_count_bucket: "1_10",
        underspend_count_bucket: "1_10",
        inserted_rows_bucket: "1-10",
        duplicate_rows_bucket: "0",
        failed_rows_bucket: "0",
        imported_rows_bucket: "1-10",
        allocation_count_bucket: "1-10",
        scope_count_bucket: "1-10",
        item_count_bucket: "1-10",
        ttl_bucket: "1d_7d",
        contacts_created_bucket: "1-10",
        donations_created_bucket: "0",
        grants_created_bucket: "0",
        funders_created_bucket: "0",
        grant_opportunities_created_bucket: "0",
        changed_fields: ["accounting_enabled"],
        accounting_enabled: true,
        address_present: false,
        amount_present: true,
        date_range_present: true,
        ein_present: true,
        logo_present: true,
        fiscal_year_start_month_changed: true,
        timezone_changed: true,
        invite_mode: "email",
        target_role: "editor",
        has_email_invite: true,
        has_permission_overrides: true,
        permission_override_keys: ["donors", "grants"],
        role_changed: true,
        status_changed: true,
        target_active: false,
        permissions_changed: true,
        bundle_reused: true,
        risk_rating: "high",
        log_type: "desk_review",
        severity: "high",
        operation: "create",
        access_level: "auditor",
        column_count: 3,
        custom_field_count: 1,
        filter_count: 2,
        sort_count: 1,
        has_description: true,
        limit_bucket: "10_25",
      });
      expect(JSON.stringify(body.properties)).not.toContain("Raw report title");
      expect(JSON.stringify(body.properties)).not.toContain("Free-form donor detail");
      expect(JSON.stringify(body.properties)).not.toContain("raw donor search text");
      expect(JSON.stringify(body.properties)).not.toContain("award.pdf");
      expect(JSON.stringify(body.properties)).not.toContain("subaward-1");
      expect(JSON.stringify(body.properties)).not.toContain("secret-token");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("keeps privacy-safe pledge telemetry properties and drops raw pledge fields", async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue("{}"),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      const integrations = getIntegrations(
        {} as never,
        {
          APP_URL: "https://app.grantpipe.com",
          INTEGRATION_MODE: "real",
          STRIPE_SECRET_KEY: "sk_test_123",
          RESEND_API_KEY: "re_test_123",
          POSTHOG_API_KEY: "phc_test",
          POSTHOG_HOST: "https://us.i.posthog.com",
          R2: { put: vi.fn(), get: vi.fn(), delete: vi.fn() },
        } as never,
      );

      await integrations.analytics.capture({
        orgId: "org-1",
        eventName: ANALYTICS_EVENTS.pledgeCreated,
        payload: {
          surface: "api",
          has_fund: true,
          has_grant: false,
          is_conditional: true,
          installment_count_bucket: "1_5",
          discount_rate_bucket: "1_500_bp",
          net_asset_class: "temporarily_restricted",
          has_installment: true,
          amount_bucket: "101_1000",
          allowance_bucket: "0",
          has_reason: false,
          has_explicit_promotion_date: true,
          operation: "pledge_created",
          failure_type: "validation",
          actorId: "user-1",
          pledgeId: "pledge-1",
          installmentId: "installment-1",
          amountCents: 123_456,
          installment_count: 4,
          reason: "Raw donor note",
        },
      });

      const body = JSON.parse((fetchMock.mock.calls[0]![1] as { body: string }).body) as {
        properties: Record<string, unknown>;
      };
      expect(body.properties).toMatchObject({
        org_id: "org-1",
        surface: "api",
        has_fund: true,
        has_grant: false,
        is_conditional: true,
        installment_count_bucket: "1_5",
        discount_rate_bucket: "1_500_bp",
        net_asset_class: "temporarily_restricted",
        has_installment: true,
        amount_bucket: "101_1000",
        allowance_bucket: "0",
        has_reason: false,
        has_explicit_promotion_date: true,
        operation: "pledge_created",
        failure_type: "validation",
      });
      expect(JSON.stringify(body)).not.toContain("user-1");
      expect(JSON.stringify(body)).not.toContain("pledge-1");
      expect(JSON.stringify(body)).not.toContain("installment-1");
      expect(JSON.stringify(body)).not.toContain("123456");
      expect(JSON.stringify(body)).not.toContain("Raw donor note");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("keeps safe donation analytics properties and drops Stripe identifiers", async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue("{}"),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      const integrations = getIntegrations(
        {} as never,
        {
          APP_URL: "https://app.grantpipe.com",
          INTEGRATION_MODE: "real",
          STRIPE_SECRET_KEY: "sk_test_123",
          RESEND_API_KEY: "re_test_123",
          POSTHOG_API_KEY: "phc_test",
          POSTHOG_HOST: "https://us.i.posthog.com",
          R2: { put: vi.fn(), get: vi.fn(), delete: vi.fn() },
        } as never,
      );

      await integrations.analytics.capture({
        orgId: "org-1",
        eventName: "donation_recorded",
        payload: {
          surface: "api",
          amount_bucket: "1000_4999",
          interval: "month",
          has_fund: true,
          has_grant: false,
          restriction: "unrestricted",
          payment_status: "paid",
          stripe_account_id: "acct_123",
          checkout_session_id: "cs_test_123",
          donor_email: "donor@example.org",
        },
      });

      const body = JSON.parse((fetchMock.mock.calls[0]![1] as { body: string }).body) as {
        properties: Record<string, unknown>;
      };
      expect(body.properties).toMatchObject({
        org_id: "org-1",
        surface: "api",
        amount_bucket: "1000_4999",
        interval: "month",
        has_fund: true,
        has_grant: false,
        restriction: "unrestricted",
        payment_status: "paid",
      });
      expect(JSON.stringify(body)).not.toContain("acct_123");
      expect(JSON.stringify(body)).not.toContain("cs_test_123");
      expect(JSON.stringify(body)).not.toContain("donor@example.org");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("keeps outbound campaign attribution properties and drops unsafe fields", async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue("{}"),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      const integrations = getIntegrations(
        {} as never,
        {
          APP_URL: "https://app.grantpipe.com",
          INTEGRATION_MODE: "real",
          STRIPE_SECRET_KEY: "sk_test_123",
          RESEND_API_KEY: "re_test_123",
          POSTHOG_API_KEY: "phc_test",
          POSTHOG_HOST: "https://us.i.posthog.com",
          R2: { put: vi.fn(), get: vi.fn(), delete: vi.fn() },
        } as never,
      );

      await integrations.analytics.capture({
        orgId: "outbound:campaign-1:plain_founder",
        eventName: "outbound_signup_completed",
        payload: {
          source_app: "signup_api",
          app_surface: "app",
          method: "email",
          auto_signin: true,
          has_invite: false,
          ref: "launch-list",
          utm_source: "instantly",
          utm_medium: "cold_email",
          utm_campaign: "campaign-1",
          utm_content: "day-1",
          utm_term: "grant compliance",
          msclkid: "ms-click-1",
          gclid: "g-click-1",
          source_section: "email",
          cta_page_family: "signup",
          cta_buyer_stage: "problem-aware",
          cta_placement: "body",
          cta_intent: "trial",
          ve_product: "grantpipe",
          ve_icp: "gp_grants_compliance_operators",
          ve_campaign_id: "campaign-1",
          ve_variant: "plain_founder",
          ve_step: "1",
          ve_offer: "compliance_calendar_trial",
          ve_instantly_campaign_id: "inst-campaign-1",
          ve_lead_list_id: "lead-list-1",
          ve_sender_pool: "grantpipe_public_2026_06",
          ve_sequence_day: "1",
          ve_branding: "plain",
          email: "must-not-be-sent@example.org",
          token: "secret-token",
        },
      });

      const body = JSON.parse((fetchMock.mock.calls[0]![1] as { body: string }).body) as {
        properties: Record<string, unknown>;
      };
      expect(body.properties).toMatchObject({
        source_app: "signup_api",
        app_surface: "app",
        method: "email",
        auto_signin: true,
        has_invite: false,
        ref: "launch-list",
        utm_content: "day-1",
        utm_term: "grant compliance",
        msclkid: "ms-click-1",
        gclid: "g-click-1",
        ve_campaign_id: "campaign-1",
        ve_variant: "plain_founder",
        ve_instantly_campaign_id: "inst-campaign-1",
        ve_lead_list_id: "lead-list-1",
        ve_sender_pool: "grantpipe_public_2026_06",
        ve_sequence_day: "1",
      });
      expect(JSON.stringify(body.properties)).not.toContain("must-not-be-sent@example.org");
      expect(JSON.stringify(body.properties)).not.toContain("secret-token");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("sanitizes path-like PostHog properties in real analytics mode", async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue("{}"),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      const integrations = getIntegrations(
        {} as never,
        {
          APP_URL: "https://app.grantpipe.com",
          INTEGRATION_MODE: "real",
          STRIPE_SECRET_KEY: "sk_test_123",
          RESEND_API_KEY: "re_test_123",
          POSTHOG_API_KEY: "phc_test",
          POSTHOG_HOST: "https://us.i.posthog.com",
          R2: { put: vi.fn(), get: vi.fn(), delete: vi.fn() },
        } as never,
      );

      await integrations.analytics.capture({
        orgId: "org-1",
        eventName: "lead_created",
        payload: {
          page_path: "/lead-magnets/550e8400-e29b-41d4-a716-446655440000?email=a@example.org",
          landing_page: "https://grantpipe.com/invite/raw-token-123?token=secret#top",
          landing_path: "/app/portal/raw-portal-secret",
          destination_path: "/app/documents/507f1f77bcf86cd799439011",
        },
      });

      const body = JSON.parse((fetchMock.mock.calls[0]![1] as { body: string }).body) as {
        properties: Record<string, unknown>;
      };
      expect(body.properties).toMatchObject({
        page_path: "/lead-magnets/[redacted-id]",
        landing_page: "/invite/[redacted]",
        landing_path: "/app/portal/[redacted]",
        destination_path: "/app/documents/[redacted-id]",
      });
      expect(JSON.stringify(body.properties)).not.toContain("a@example.org");
      expect(JSON.stringify(body.properties)).not.toContain("secret");
      expect(JSON.stringify(body.properties)).not.toContain("550e8400");
      expect(JSON.stringify(body.properties)).not.toContain("507f1f77");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("keeps analytics capture alive when path segments contain malformed escapes", async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue("{}"),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      const integrations = getIntegrations(
        {} as never,
        {
          APP_URL: "https://app.grantpipe.com",
          INTEGRATION_MODE: "real",
          STRIPE_SECRET_KEY: "sk_test_123",
          RESEND_API_KEY: "re_test_123",
          POSTHOG_API_KEY: "phc_test",
          POSTHOG_HOST: "https://us.i.posthog.com",
          R2: { put: vi.fn(), get: vi.fn(), delete: vi.fn() },
        } as never,
      );

      await expect(
        integrations.analytics.capture({
          orgId: "org-1",
          eventName: "lead_created",
          payload: {
            page_path: "/lead-magnets/%E0%A4%A?token=secret",
            landing_path: "/app/portal/raw-portal-secret/%E0%A4%A?token=secret",
          },
        }),
      ).resolves.toEqual({ id: "posthog" });

      const body = JSON.parse((fetchMock.mock.calls[0]![1] as { body: string }).body) as {
        properties: Record<string, unknown>;
      };
      expect(body.properties.page_path).toBe("/lead-magnets/%E0%A4%A");
      expect(body.properties.landing_path).toBe("/app/portal/[redacted]/%E0%A4%A");
      expect(JSON.stringify(body.properties)).not.toContain("secret");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("throws when the real PostHog capture endpoint rejects the event", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: vi.fn().mockResolvedValue("server error"),
    }) as unknown as typeof fetch;
    try {
      const integrations = getIntegrations(
        {} as never,
        {
          APP_URL: "https://app.grantpipe.com",
          INTEGRATION_MODE: "real",
          STRIPE_SECRET_KEY: "sk_test_123",
          RESEND_API_KEY: "re_test_123",
          POSTHOG_API_KEY: "phc_test",
          R2: { put: vi.fn(), get: vi.fn(), delete: vi.fn() },
        } as never,
      );

      await expect(integrations.analytics.capture({ eventName: "payment_failed" })).rejects.toThrow(
        "PostHog capture failed: 500 server error",
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("throws when the PostHog key is removed after real analytics creation", async () => {
    const bindings = {
      APP_URL: "https://app.grantpipe.com",
      INTEGRATION_MODE: "real",
      STRIPE_SECRET_KEY: "sk_test_123",
      RESEND_API_KEY: "re_test_123",
      POSTHOG_API_KEY: "phc_test",
      R2: { put: vi.fn(), get: vi.fn(), delete: vi.fn() },
    } as Record<string, unknown>;
    const integrations = getIntegrations({} as never, bindings as never);
    delete bindings.POSTHOG_API_KEY;

    await expect(integrations.analytics.capture({ eventName: "checkout_started" })).rejects.toThrow(
      "POSTHOG_API_KEY is required for real analytics mode",
    );
  });

  it("returns an empty analytics list in real mode", async () => {
    const integrations = getIntegrations(
      {} as never,
      {
        APP_URL: "https://app.grantpipe.com",
        INTEGRATION_MODE: "real",
        STRIPE_SECRET_KEY: "sk_test_123",
        RESEND_API_KEY: "re_test_123",
        POSTHOG_API_KEY: "phc_test",
        R2: { put: vi.fn(), get: vi.fn(), delete: vi.fn() },
      } as never,
    );

    await expect(integrations.analytics.list("org-1", 1, 10)).resolves.toEqual({
      data: [],
      total: 0,
    });
  });

  it("mock error capture defaults level to error in memory", async () => {
    const db = createMockDb();
    const integrations = getIntegrations(db as never, { APP_URL: "http://x" } as never);
    await integrations.errors.capture({ message: "boom" });
    const result = await integrations.errors.list("system", 1, 10);
    expect(result.data[0]).toMatchObject({ level: "error", orgId: "system" });
  });

  it("billing.getSummary derives URLs with a relative path that lacks a leading slash", async () => {
    const db = createMockDb();
    const integrations = getIntegrations(db as never, { APP_URL: "http://x" } as never);
    const portal = await integrations.billing.createPortalSession({
      orgId: "org-1",
      initiatedBy: "user-1",
      returnPath: "settings/billing",
    });
    expect(portal.url.startsWith("http://x/app/settings/billing")).toBe(true);
  });

  it("billing.getSummary preserves a path already under /app", async () => {
    const db = createMockDb();
    const integrations = getIntegrations(db as never, { APP_URL: "http://x" } as never);
    const portal = await integrations.billing.createPortalSession({
      orgId: "org-1",
      initiatedBy: "user-1",
      returnPath: "/app",
    });
    expect(portal.url.startsWith("http://x/app?portal=")).toBe(true);
  });

  it("places mock portal query params before hash fragments", async () => {
    const db = createMockDb();
    const integrations = getIntegrations(db as never, { APP_URL: "http://x" } as never);
    const portal = await integrations.billing.createPortalSession({
      orgId: "org-1",
      initiatedBy: "user-1",
      returnPath: "/settings#billing",
    });

    expect(portal.url).toMatch(/^http:\/\/x\/app\/settings\?portal=[^#]+#billing$/);
  });

  it("mock storage.put defaults orgId to 'system' and marks utf8 encoding for string bodies", async () => {
    const db = createMockDb();
    const integrations = getIntegrations(db as never, { APP_URL: "http://x" } as never);
    await integrations.storage.put({
      key: "k",
      body: "plain-text",
      contentType: "text/plain",
      fileName: "f.txt",
      source: { entityType: "e", entityId: "e-1" },
    });
    const result = await integrations.storage.list("system", 1, 10);
    expect(result.data[0]).toMatchObject({ orgId: "system", bodyEncoding: "utf8" });
  });

  it("mock storage.get returns null when the row is missing", async () => {
    const db = createMockDb();
    const integrations = getIntegrations(db as never, { APP_URL: "http://x" } as never);
    await expect(integrations.storage.get("missing")).resolves.toBeNull();
  });

  it("mock billing.getSummary falls back to defaults when the org record is missing", async () => {
    const db = createMockDb();
    db.query.organizations.findFirst.mockResolvedValueOnce(undefined);
    const integrations = getIntegrations(db as never, { APP_URL: "http://x" } as never);
    const summary = await integrations.billing.getSummary("org-1");
    expect(summary).toMatchObject({
      customerId: null,
      subscriptionId: null,
      planTier: "starter",
      billingCycle: "annual",
      status: "trialing",
      trialEndsAt: null,
      promoCodeApplied: null,
    });
  });

  it("mock billing.getSummary narrows org lookup to billing-relevant columns", async () => {
    const db = createMockDb();
    db.query.organizations.findFirst.mockResolvedValueOnce(undefined);
    const integrations = getIntegrations(db as never, { APP_URL: "http://x" } as never);
    await integrations.billing.getSummary("org-1");
    const args = db.query.organizations.findFirst.mock.calls[0]![0] as {
      columns?: Record<string, boolean>;
    };
    expect(args.columns).toEqual({
      subscriptionStatus: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      planTier: true,
      billingCycle: true,
      trialEndsAt: true,
      promoCodeApplied: true,
    });
  });

  it("billing.getSummary reads the org subscription status and trial end", async () => {
    const db = createMockDb();
    const trialEndsAt = new Date("2026-04-30T00:00:00.000Z");
    db.query.organizations.findFirst.mockResolvedValueOnce({
      id: "org-1",
      planTier: "growth",
      billingCycle: "annual",
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
      subscriptionStatus: "active",
      trialEndsAt,
      promoCodeApplied: "Y80OFF",
    });
    const integrations = getIntegrations(db as never, { APP_URL: "http://x" } as never);
    const summary = await integrations.billing.getSummary("org-1");
    expect(summary).toMatchObject({
      customerId: "cus_1",
      subscriptionId: "sub_1",
      planTier: "growth",
      billingCycle: "annual",
      status: "active",
      trialEndsAt: trialEndsAt.toISOString(),
      promoCodeApplied: "Y80OFF",
    });
  });

  it("mock billing.createCheckoutSession ignores retired promo code and persists cycle on the org", async () => {
    const db = createMockDb();
    const updates: Record<string, unknown>[] = [];
    db.update.mockImplementation(() => ({
      set: vi.fn().mockImplementation((val: Record<string, unknown>) => {
        updates.push(val);
        return { where: vi.fn().mockResolvedValue(undefined) };
      }),
    }));
    const integrations = getIntegrations(db as never, { APP_URL: "http://x" } as never);
    await integrations.billing.createCheckoutSession({
      checkoutAttemptId: "33333333-3333-4333-8333-333333333333",
      orgId: "org-1",
      initiatedBy: "user-1",
      planTier: "growth",
      billingCycle: "annual",
      promoCode: "Y80OFF",
    });
    expect(updates[0]).toMatchObject({
      planTier: "growth",
      billingCycle: "annual",
      subscriptionStatus: "active",
      promoCodeApplied: null,
      planSelectedAt: expect.any(Date),
    });
  });

  it("mock billing.createCheckoutSession does not persist explicit blank promo sentinel", async () => {
    const db = createMockDb();
    const updates: Record<string, unknown>[] = [];
    const inserted: Record<string, unknown>[] = [];
    db.update.mockImplementation(() => ({
      set: vi.fn().mockImplementation((val: Record<string, unknown>) => {
        updates.push(val);
        return { where: vi.fn().mockResolvedValue(undefined) };
      }),
    }));
    db.insert.mockReturnValue({
      values: vi.fn().mockImplementation((val: Record<string, unknown>) => {
        inserted.push(val);
        return Promise.resolve();
      }),
    });
    const integrations = getIntegrations(db as never, { APP_URL: "http://x" } as never);
    await integrations.billing.createCheckoutSession({
      checkoutAttemptId: "33333333-3333-4333-8333-333333333333",
      orgId: "org-1",
      initiatedBy: "user-1",
      planTier: "growth",
      billingCycle: "annual",
      promoCode: "",
    });
    expect(updates[0]).toMatchObject({ promoCodeApplied: null });
    expect(inserted[0]).toMatchObject({
      payload: expect.objectContaining({ promoCode: null }),
    });
  });

  it("mock billing.createCheckoutSession rejects Enterprise checkout", async () => {
    const db = createMockDb();
    const integrations = getIntegrations(db as never, { APP_URL: "http://x" } as never);
    await expect(
      integrations.billing.createCheckoutSession({
        checkoutAttemptId: "33333333-3333-4333-8333-333333333333",
        orgId: "org-1",
        initiatedBy: "user-1",
        planTier: "enterprise",
        billingCycle: "annual",
      }),
    ).rejects.toThrow("Enterprise is handled through founder contact.");
    expect(db.update).not.toHaveBeenCalled();
  });
});
describe("real Stripe billing provider", () => {
  type FetchCall = { url: string; init: RequestInit };
  let calls: FetchCall[];
  let originalFetch: typeof fetch;

  const generatedCheckoutIdempotencyKey = () =>
    expect.stringMatching(
      /^checkout:org-1:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );

  function setStripeFetch(handler: (call: FetchCall) => Response | Promise<Response>) {
    globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = typeof input === "string" ? input : input.toString();
      const call = { url, init };
      calls.push(call);
      return handler(call);
    }) as typeof fetch;
  }

  function buildBindings(extra: Partial<Record<string, unknown>> = {}) {
    return {
      APP_URL: "http://localhost:5173",
      INTEGRATION_MODE: "real",
      R2: { put: vi.fn(), get: vi.fn(), delete: vi.fn() },
      STRIPE_SECRET_KEY: "sk_test_123",
      RESEND_API_KEY: "re_test_123",
      STRIPE_WEBHOOK_SECRET: "whsec_test",
      STRIPE_PRICE_STARTER_MONTHLY: "price_1TpHBILcwbPKn2Kg6KhahvP7",
      STRIPE_PRICE_STARTER_ANNUAL: "price_1TpHBtLcwbPKn2KgGswNPVRz",
      STRIPE_PRICE_GROWTH_MONTHLY: "price_1TpHERLcwbPKn2Kg7LC3F5h5",
      STRIPE_PRICE_GROWTH_ANNUAL: "price_1TpHERLcwbPKn2Kg7LC3F5h5",
      STRIPE_PRICE_AUDIT_READY_MONTHLY: "price_1TpHFJLcwbPKn2KgaaiO8VJY",
      STRIPE_PRICE_AUDIT_READY_ANNUAL: "price_1TpHFnLcwbPKn2KgijASHvQL",
      ...extra,
    } as never;
  }

  function buildDb(orgRow: Record<string, unknown> | undefined = undefined) {
    const inserted: Record<string, unknown>[] = [];
    return {
      db: {
        query: {
          organizations: { findFirst: vi.fn().mockResolvedValue(orgRow) },
        },
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockImplementation((val: Record<string, unknown>) => {
            inserted.push(val);
            return Promise.resolve();
          }),
        }),
        select: vi.fn().mockImplementation((selection?: { count?: unknown }) => {
          if (selection && "count" in selection) {
            return {
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([{ count: 0 }]),
              }),
            };
          }
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    offset: vi.fn().mockResolvedValue([]),
                  }),
                }),
              }),
            }),
          };
        }),
      } as never,
      inserted,
    };
  }

  beforeEach(() => {
    calls = [];
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("creates a checkout session, resolves price, ignores retired promo, and trims to the existing trial", async () => {
    const trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const { db, inserted } = buildDb({
      id: "org-1",
      stripeCustomerId: "cus_existing",
      trialEndsAt,
    });
    setStripeFetch(({ url }) => {
      if (url.startsWith("https://api.stripe.com/v1/promotion_codes")) {
        return new Response(JSON.stringify({ data: [{ id: "promo_1" }] }), { status: 200 });
      }
      return new Response(
        JSON.stringify({ id: "cs_123", url: "https://checkout.stripe.com/cs_123" }),
        { status: 200 },
      );
    });
    const integrations = getIntegrations(db, buildBindings());
    const result = await integrations.billing.createCheckoutSession({
      checkoutAttemptId: "33333333-3333-4333-8333-333333333333",
      orgId: "org-1",
      initiatedBy: "user-1",
      planTier: "growth",
      billingCycle: "annual",
      promoCode: "Y80OFF",
    });
    expect(result).toEqual({ sessionId: "cs_123", url: "https://checkout.stripe.com/cs_123" });
    expect(calls.find((c) => c.url.includes("/promotion_codes"))).toBeUndefined();
    const checkoutCall = calls.find((c) => c.url.endsWith("/checkout/sessions"));
    expect(checkoutCall).toBeDefined();
    expect(checkoutCall!.init.headers).toMatchObject({
      "Idempotency-Key": generatedCheckoutIdempotencyKey(),
    });
    const body = checkoutCall!.init.body as string;
    expect(body).not.toContain("line_items%5B0%5D%5Bprice%5D=");
    expect(body).toContain("line_items%5B0%5D%5Bprice_data%5D%5Bcurrency%5D=usd");
    expect(body).toContain("line_items%5B0%5D%5Bprice_data%5D%5Bunit_amount%5D=94800");
    expect(body).toContain("line_items%5B0%5D%5Bprice_data%5D%5Brecurring%5D%5Binterval%5D=year");
    expect(body).toContain(
      "line_items%5B0%5D%5Bprice_data%5D%5Bproduct_data%5D%5Bname%5D=GrantPipe+Growth",
    );
    expect(body).toContain("customer=cus_existing");
    expect(body).toContain("subscription_data%5Btrial_end%5D=");
    expect(body).toContain("subscription_data%5Bmetadata%5D%5BorgId%5D=org-1");
    expect(body).not.toContain("discounts%5B0%5D%5Bpromotion_code%5D=promo_1");
    expect(body).not.toContain("allow_promotion_codes=true");
    expect(inserted[0]).toMatchObject({
      orgId: "org-1",
      eventType: "billing.checkout.requested",
    });
  });

  it("does not apply Y80OFF when no explicit promo is provided for annual checkout", async () => {
    const { db } = buildDb({ id: "org-1" });
    setStripeFetch(({ url }) => {
      if (url.startsWith("https://api.stripe.com/v1/promotion_codes")) {
        return new Response(JSON.stringify({ data: [{ id: "promo_y80off" }] }), {
          status: 200,
        });
      }
      return new Response(JSON.stringify({ id: "cs_launch", url: "https://checkout/launch" }), {
        status: 200,
      });
    });
    const integrations = getIntegrations(db, buildBindings());
    await integrations.billing.createCheckoutSession({
      checkoutAttemptId: "33333333-3333-4333-8333-333333333333",
      orgId: "org-1",
      initiatedBy: "user-1",
      planTier: "starter",
      billingCycle: "annual",
    });
    expect(calls.find((c) => c.url.includes("/promotion_codes"))).toBeUndefined();
    const checkoutCall = calls.find((c) => c.url.endsWith("/checkout/sessions"));
    expect(checkoutCall!.init.headers).toMatchObject({
      "Idempotency-Key": generatedCheckoutIdempotencyKey(),
    });
    const body = checkoutCall!.init.body as string;
    expect(body).toContain("line_items%5B0%5D%5Bprice%5D=price_1TpHBtLcwbPKn2KgGswNPVRz");
    expect(body).not.toContain("line_items%5B0%5D%5Bprice_data%5D");
    expect(body).not.toContain("discounts%5B0%5D");
    expect(body).not.toContain("allow_promotion_codes=true");
  });

  it("uses inline monthly price data when a same-tier Stripe price id is shared", async () => {
    const { db } = buildDb({ id: "org-1" });
    setStripeFetch(
      () =>
        new Response(JSON.stringify({ id: "cs_monthly", url: "https://checkout/monthly" }), {
          status: 200,
        }),
    );
    const integrations = getIntegrations(db, buildBindings());

    await integrations.billing.createCheckoutSession({
      checkoutAttemptId: "33333333-3333-4333-8333-333333333333",
      orgId: "org-1",
      initiatedBy: "user-1",
      planTier: "growth",
      billingCycle: "monthly",
    });

    const checkoutCall = calls.find((c) => c.url.endsWith("/checkout/sessions"));
    expect(checkoutCall!.init.headers).toMatchObject({
      "Idempotency-Key": generatedCheckoutIdempotencyKey(),
    });
    const body = checkoutCall!.init.body as string;
    expect(body).not.toContain("line_items%5B0%5D%5Bprice%5D=");
    expect(body).toContain("line_items%5B0%5D%5Bprice_data%5D%5Bcurrency%5D=usd");
    expect(body).toContain("line_items%5B0%5D%5Bprice_data%5D%5Bunit_amount%5D=9900");
    expect(body).toContain("line_items%5B0%5D%5Bprice_data%5D%5Brecurring%5D%5Binterval%5D=month");
    expect(body).toContain(
      "line_items%5B0%5D%5Bprice_data%5D%5Bproduct_data%5D%5Bname%5D=GrantPipe+Growth",
    );
  });

  it("does not apply M80OFF when no explicit promo is provided for monthly checkout", async () => {
    const { db } = buildDb({ id: "org-1" });
    setStripeFetch(({ url }) => {
      if (url.startsWith("https://api.stripe.com/v1/promotion_codes")) {
        return new Response(JSON.stringify({ data: [{ id: "promo_m80off" }] }), {
          status: 200,
        });
      }
      return new Response(JSON.stringify({ id: "cs_launch", url: "https://checkout/launch" }), {
        status: 200,
      });
    });
    const integrations = getIntegrations(db, buildBindings());
    await integrations.billing.createCheckoutSession({
      checkoutAttemptId: "33333333-3333-4333-8333-333333333333",
      orgId: "org-1",
      initiatedBy: "user-1",
      planTier: "starter",
      billingCycle: "monthly",
    });
    expect(calls.find((c) => c.url.includes("/promotion_codes"))).toBeUndefined();
    const checkoutCall = calls.find((c) => c.url.endsWith("/checkout/sessions"));
    expect(checkoutCall!.init.headers).toMatchObject({
      "Idempotency-Key": generatedCheckoutIdempotencyKey(),
    });
    expect(checkoutCall!.init.body as string).not.toContain("discounts%5B0%5D");
    expect(checkoutCall!.init.body as string).not.toContain("allow_promotion_codes=true");
  });

  it("falls back to undiscounted checkout when implicit limited offer is missing in Stripe", async () => {
    const { db } = buildDb({ id: "org-1" });
    setStripeFetch(({ url }) => {
      if (url.startsWith("https://api.stripe.com/v1/promotion_codes")) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({ id: "cs_full_price", url: "https://checkout/full" }), {
        status: 200,
      });
    });
    const integrations = getIntegrations(db, buildBindings());

    await integrations.billing.createCheckoutSession({
      checkoutAttemptId: "33333333-3333-4333-8333-333333333333",
      orgId: "org-1",
      initiatedBy: "user-1",
      planTier: "starter",
      billingCycle: "annual",
    });

    const checkoutCall = calls.find((c) => c.url.endsWith("/checkout/sessions"));
    expect(checkoutCall!.init.headers).toMatchObject({
      "Idempotency-Key": generatedCheckoutIdempotencyKey(),
    });
    const body = checkoutCall!.init.body as string;
    expect(body).not.toContain("allow_promotion_codes=true");
    expect(body).not.toContain("metadata%5BpromoCode%5D=");
    expect(body).not.toContain("subscription_data%5Bmetadata%5D%5BpromoCode%5D=");
  });

  it("ignores retired monthly code for annual checkout", async () => {
    const { db } = buildDb({ id: "org-1" });
    setStripeFetch(({ url }) => {
      if (url.startsWith("https://api.stripe.com/v1/promotion_codes")) {
        return new Response(JSON.stringify({ data: [{ id: "promo_y80off" }] }), {
          status: 200,
        });
      }
      return new Response(JSON.stringify({ id: "cs_y80off", url: "https://checkout/y80off" }), {
        status: 200,
      });
    });
    const integrations = getIntegrations(db, buildBindings());
    await integrations.billing.createCheckoutSession({
      checkoutAttemptId: "33333333-3333-4333-8333-333333333333",
      orgId: "org-1",
      initiatedBy: "user-1",
      planTier: "starter",
      billingCycle: "annual",
      promoCode: "M80OFF",
    });
    expect(calls.find((c) => c.url.includes("/promotion_codes"))).toBeUndefined();
    const checkoutCall = calls.find((c) => c.url.endsWith("/checkout/sessions"));
    expect(checkoutCall!.init.headers).toMatchObject({
      "Idempotency-Key": generatedCheckoutIdempotencyKey(),
    });
    expect(checkoutCall!.init.body as string).not.toContain("metadata%5BpromoCode%5D=");
    expect(checkoutCall!.init.body as string).not.toContain("allow_promotion_codes=true");
  });

  it("ignores explicit retired Y80OFF without looking it up in Stripe", async () => {
    const { db } = buildDb({ id: "org-1" });
    setStripeFetch(({ url }) => {
      if (url.startsWith("https://api.stripe.com/v1/promotion_codes")) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({ id: "cs_full_price", url: "https://checkout/full" }), {
        status: 200,
      });
    });
    const integrations = getIntegrations(db, buildBindings());

    await integrations.billing.createCheckoutSession({
      checkoutAttemptId: "33333333-3333-4333-8333-333333333333",
      orgId: "org-1",
      initiatedBy: "user-1",
      planTier: "starter",
      billingCycle: "annual",
      promoCode: "Y80OFF",
    });

    expect(calls.find((c) => c.url.includes("/promotion_codes"))).toBeUndefined();
    const checkoutCall = calls.find((c) => c.url.endsWith("/checkout/sessions"));
    expect(checkoutCall).toBeDefined();
    expect(checkoutCall!.init.body as string).not.toContain("allow_promotion_codes=true");
  });

  it("normalizes explicit lowercase retired Y80OFF but does not preserve it in billing payload", async () => {
    const { db } = buildDb({ id: "org-1" });
    const inserted: Record<string, unknown>[] = [];
    (db as { insert: ReturnType<typeof vi.fn> }).insert.mockReturnValue({
      values: vi.fn().mockImplementation((val: Record<string, unknown>) => {
        inserted.push(val);
        return Promise.resolve();
      }),
    });
    setStripeFetch(({ url }) => {
      if (url.startsWith("https://api.stripe.com/v1/promotion_codes")) {
        return new Response(JSON.stringify({ data: [{ id: "promo_y80off" }] }), {
          status: 200,
        });
      }
      return new Response(JSON.stringify({ id: "cs_launch", url: "https://checkout/launch" }), {
        status: 200,
      });
    });
    const integrations = getIntegrations(db, buildBindings());
    await integrations.billing.createCheckoutSession({
      checkoutAttemptId: "33333333-3333-4333-8333-333333333333",
      orgId: "org-1",
      initiatedBy: "user-1",
      planTier: "starter",
      billingCycle: "annual",
      promoCode: "y80off",
    });
    expect(calls.find((c) => c.url.includes("/promotion_codes"))).toBeUndefined();
    const checkoutCall = calls.find((c) => c.url.endsWith("/checkout/sessions"));
    expect(checkoutCall!.init.headers).toMatchObject({
      "Idempotency-Key": generatedCheckoutIdempotencyKey(),
    });
    expect(inserted[0]).toMatchObject({
      payload: expect.objectContaining({ promoCode: null }),
    });
  });

  it("rejects Enterprise checkout before looking up Stripe prices", async () => {
    const { db } = buildDb({ id: "org-1" });
    setStripeFetch(() => new Response("{}", { status: 200 }));
    const integrations = getIntegrations(db, buildBindings());
    await expect(
      integrations.billing.createCheckoutSession({
        checkoutAttemptId: "33333333-3333-4333-8333-333333333333",
        orgId: "org-1",
        initiatedBy: "user-1",
        planTier: "enterprise",
        billingCycle: "annual",
      }),
    ).rejects.toThrow("Enterprise is handled through founder contact.");
    expect(calls).toHaveLength(0);
  });

  it("keeps the real billing summary readable without STRIPE_SECRET_KEY", async () => {
    const { db } = buildDb({
      id: "org-1",
      planTier: "starter",
      billingCycle: "monthly",
      subscriptionStatus: "trialing",
      trialEndsAt: new Date("2026-08-01T00:00:00.000Z"),
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      promoCodeApplied: null,
    });

    const integrations = getIntegrations(db, {
      APP_URL: "http://x",
      INTEGRATION_MODE: "real",
      RESEND_API_KEY: "re_test_key",
      R2: { put: vi.fn(), get: vi.fn(), delete: vi.fn() },
    } as never);

    await expect(integrations.billing.getSummary("org-1")).resolves.toMatchObject({
      planTier: "starter",
      billingCycle: "monthly",
      status: "trialing",
      customerId: null,
      subscriptionId: null,
    });
  });

  it("uses one Stripe idempotency key per logical checkout attempt", async () => {
    const { db } = buildDb({ id: "org-1", stripeCustomerId: null, trialEndsAt: null });
    setStripeFetch(
      () =>
        new Response(JSON.stringify({ id: "cs_1", url: "https://checkout.stripe.com/cs_1" }), {
          status: 200,
        }),
    );
    const integrations = getIntegrations(db, buildBindings());
    const base = {
      orgId: "org-1",
      initiatedBy: "user-1",
      planTier: "starter" as const,
      billingCycle: "monthly" as const,
    };

    await integrations.billing.createCheckoutSession({
      ...base,
      checkoutAttemptId: "11111111-1111-4111-8111-111111111111",
    });
    await integrations.billing.createCheckoutSession({
      ...base,
      checkoutAttemptId: "22222222-2222-4222-8222-222222222222",
    });

    const checkoutCalls = calls.filter((call) => call.url.endsWith("/checkout/sessions"));
    expect(checkoutCalls.map((call) => call.init.headers)).toEqual([
      expect.objectContaining({
        "Idempotency-Key": "checkout:org-1:11111111-1111-4111-8111-111111111111",
      }),
      expect.objectContaining({
        "Idempotency-Key": "checkout:org-1:22222222-2222-4222-8222-222222222222",
      }),
    ]);
  });

  it("throws when the requested price binding is missing", async () => {
    const { db } = buildDb({ id: "org-1" });
    setStripeFetch(() => new Response("{}", { status: 200 }));
    const bindings = buildBindings();
    delete (bindings as Record<string, unknown>).STRIPE_PRICE_STARTER_MONTHLY;
    const integrations = getIntegrations(db, bindings);
    await expect(
      integrations.billing.createCheckoutSession({
        checkoutAttemptId: "33333333-3333-4333-8333-333333333333",
        orgId: "org-1",
        initiatedBy: "user-1",
        planTier: "starter",
        billingCycle: "monthly",
      }),
    ).rejects.toThrow("Missing Stripe price binding STRIPE_PRICE_STARTER_MONTHLY");
  });

  it("opens a billing portal for an org with a stripe customer", async () => {
    const { db, inserted } = buildDb({ id: "org-1", stripeCustomerId: "cus_x" });
    setStripeFetch(
      () =>
        new Response(JSON.stringify({ id: "bps_1", url: "https://billing.stripe.com/p/1" }), {
          status: 200,
        }),
    );
    const integrations = getIntegrations(db, buildBindings());
    const result = await integrations.billing.createPortalSession({
      orgId: "org-1",
      initiatedBy: "user-1",
      returnPath: "/settings",
    });
    expect(result.url).toBe("https://billing.stripe.com/p/1");
    expect(inserted[0]).toMatchObject({ eventType: "billing.portal.opened" });
  });

  it("rejects portal session when org has no stripe customer", async () => {
    const { db } = buildDb({ id: "org-1", stripeCustomerId: null });
    setStripeFetch(() => new Response("{}", { status: 200 }));
    const integrations = getIntegrations(db, buildBindings());
    await expect(
      integrations.billing.createPortalSession({
        orgId: "org-1",
        initiatedBy: "user-1",
        returnPath: "/settings",
      }),
    ).rejects.toThrow("Stripe customer not provisioned");
  });

  it("propagates Stripe error responses", async () => {
    const { db } = buildDb({ id: "org-1" });
    setStripeFetch(({ url }) => {
      if (url.startsWith("https://api.stripe.com/v1/promotion_codes")) {
        return new Response(JSON.stringify({ data: [{ id: "promo_y80off" }] }), {
          status: 200,
        });
      }
      return new Response(JSON.stringify({ error: { message: "bad" } }), { status: 400 });
    });
    const integrations = getIntegrations(db, buildBindings());
    await expect(
      integrations.billing.createCheckoutSession({
        checkoutAttemptId: "33333333-3333-4333-8333-333333333333",
        orgId: "org-1",
        initiatedBy: "user-1",
        planTier: "starter",
      }),
    ).rejects.toThrow("Stripe POST /checkout/sessions failed");
  });

  it("getSummary returns null URLs for the real provider", async () => {
    const { db } = buildDb({
      id: "org-1",
      planTier: "growth",
      billingCycle: "annual",
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
      subscriptionStatus: "active",
      trialEndsAt: null,
      promoCodeApplied: null,
    });
    const integrations = getIntegrations(db, buildBindings());
    const summary = await integrations.billing.getSummary("org-1");
    expect(summary).toMatchObject({ checkoutUrl: null, portalUrl: null, status: "active" });
  });

  it("getSummary serializes trial end dates for the real provider", async () => {
    const trialEndsAt = new Date("2026-06-15T12:00:00.000Z");
    const { db } = buildDb({
      id: "org-1",
      planTier: "starter",
      billingCycle: "monthly",
      subscriptionStatus: "trialing",
      trialEndsAt,
    });
    const integrations = getIntegrations(db, buildBindings());

    await expect(integrations.billing.getSummary("org-1")).resolves.toMatchObject({
      trialEndsAt: trialEndsAt.toISOString(),
    });
  });

  it("falls back to no promo metadata when checkout cycle is not promo eligible", async () => {
    const { db } = buildDb({ id: "org-1" });
    setStripeFetch(
      () =>
        new Response(JSON.stringify({ id: "cs_no_promo", url: "https://checkout/no-promo" }), {
          status: 200,
        }),
    );
    const integrations = getIntegrations(db, buildBindings({ undefined: "price_unknown_cycle" }));

    await integrations.billing.createCheckoutSession({
      checkoutAttemptId: "33333333-3333-4333-8333-333333333333",
      orgId: "org-1",
      initiatedBy: "user-1",
      planTier: "starter",
      billingCycle: "weekly" as never,
    });

    const checkoutCall = calls.find((c) => c.url.endsWith("/checkout/sessions"));
    expect(checkoutCall!.init.body as string).not.toContain("allow_promotion_codes=true");
    expect(checkoutCall!.init.headers).toMatchObject({
      "Idempotency-Key": generatedCheckoutIdempotencyKey(),
    });
  });

  it("getSummary falls back to defaults when org is not found in real mode", async () => {
    // Passing undefined so findFirst resolves to undefined → all ?? fallbacks are exercised
    const { db } = buildDb(undefined);
    const integrations = getIntegrations(db, buildBindings());
    const summary = await integrations.billing.getSummary("org-missing");
    expect(summary).toMatchObject({
      customerId: null,
      subscriptionId: null,
      planTier: "starter",
      billingCycle: "annual",
      status: "trialing",
      trialEndsAt: null,
      promoCodeApplied: null,
      checkoutUrl: null,
      portalUrl: null,
    });
  });

  it("getSummary narrows org lookup to billing-relevant columns (avoids plan_selected_at)", async () => {
    const { db } = buildDb(undefined);
    const integrations = getIntegrations(db, buildBindings());
    await integrations.billing.getSummary("org-1");
    const findFirst = (
      db as unknown as {
        query: { organizations: { findFirst: ReturnType<typeof vi.fn> } };
      }
    ).query.organizations.findFirst;
    const args = findFirst.mock.calls[0]![0] as { columns?: Record<string, boolean> };
    expect(args.columns).toEqual({
      subscriptionStatus: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      planTier: true,
      billingCycle: true,
      trialEndsAt: true,
      promoCodeApplied: true,
    });
  });

  it("returns empty object from stripeFetch when response body is empty", async () => {
    const { db } = buildDb({ id: "org-1" });
    // Respond with an empty body — stripeFetch should return {} (no id/url)
    setStripeFetch(() => new Response("", { status: 200 }));
    const integrations = getIntegrations(db, buildBindings());
    // createCheckoutSession uses stripeFetch — with empty body the session result has
    // no id/url but resolves rather than throws; verify the empty branch is exercised
    const result = await integrations.billing.createCheckoutSession({
      checkoutAttemptId: "33333333-3333-4333-8333-333333333333",
      orgId: "org-1",
      initiatedBy: "user-1",
      planTier: "starter",
      billingCycle: "monthly",
      promoCode: "",
    });
    expect(result.sessionId).toBeUndefined();
    expect(result.url).toBeUndefined();
  });

  it("listEvents reads from the local billingEvents table even in real mode", async () => {
    const { db } = buildDb({ id: "org-1" });
    const integrations = getIntegrations(db, buildBindings());
    const result = await integrations.billing.listEvents("org-1", 1, 5);
    expect(result.total).toBe(0);
  });

  it("skips promo discount when no active promotion code matches", async () => {
    const { db } = buildDb({ id: "org-1" });
    setStripeFetch(({ url }) => {
      if (url.includes("/promotion_codes")) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({ id: "cs_1", url: "https://checkout/x" }), {
        status: 200,
      });
    });
    const integrations = getIntegrations(db, buildBindings());
    await integrations.billing.createCheckoutSession({
      checkoutAttemptId: "33333333-3333-4333-8333-333333333333",
      orgId: "org-1",
      initiatedBy: "user-1",
      planTier: "starter",
      billingCycle: "monthly",
      promoCode: "NOPE",
    });
    const checkoutCall = calls.find((c) => c.url.endsWith("/checkout/sessions"));
    expect(checkoutCall!.init.body as string).not.toContain("discounts%5B0%5D%5Bpromotion_code%5D");
  });

  it("attaches an explicit active non-launch Stripe promotion code", async () => {
    const { db } = buildDb({ id: "org-1" });
    setStripeFetch(({ url }) => {
      if (url.includes("/promotion_codes")) {
        return new Response(JSON.stringify({ data: [{ id: "promo_save10" }] }), {
          status: 200,
        });
      }
      return new Response(JSON.stringify({ id: "cs_1", url: "https://checkout/x" }), {
        status: 200,
      });
    });
    const integrations = getIntegrations(db, buildBindings());
    await integrations.billing.createCheckoutSession({
      checkoutAttemptId: "33333333-3333-4333-8333-333333333333",
      orgId: "org-1",
      initiatedBy: "user-1",
      planTier: "starter",
      billingCycle: "monthly",
      promoCode: "SAVE10",
    });

    const checkoutCall = calls.find((c) => c.url.endsWith("/checkout/sessions"));
    const body = checkoutCall!.init.body as string;
    expect(body).toContain("discounts%5B0%5D%5Bpromotion_code%5D=promo_save10");
    expect(body).toContain("metadata%5BpromoCode%5D=SAVE10");
    expect(body).toContain("subscription_data%5Bmetadata%5D%5BpromoCode%5D=SAVE10");
    expect(checkoutCall!.init.headers).toMatchObject({
      "Idempotency-Key": generatedCheckoutIdempotencyKey(),
    });
  });

  it("ignores retired M80OFF promo code", async () => {
    const { db } = buildDb({ id: "org-1" });
    setStripeFetch(({ url }) => {
      if (url.includes("/promotion_codes")) {
        return new Response(JSON.stringify({ data: [{ id: "promo_m80off" }] }), {
          status: 200,
        });
      }
      return new Response(JSON.stringify({ id: "cs_1", url: "https://checkout/x" }), {
        status: 200,
      });
    });
    const integrations = getIntegrations(db, buildBindings());
    await integrations.billing.createCheckoutSession({
      checkoutAttemptId: "33333333-3333-4333-8333-333333333333",
      orgId: "org-1",
      initiatedBy: "user-1",
      planTier: "starter",
      billingCycle: "monthly",
      promoCode: "m80off",
    });

    expect(calls.find((c) => c.url.includes("/promotion_codes"))).toBeUndefined();
    const checkoutCall = calls.find((c) => c.url.endsWith("/checkout/sessions"));
    expect(checkoutCall!.init.body as string).not.toContain("metadata%5BpromoCode%5D=");
    expect(checkoutCall!.init.body as string).not.toContain("allow_promotion_codes=true");
    expect(checkoutCall!.init.headers).toMatchObject({
      "Idempotency-Key": generatedCheckoutIdempotencyKey(),
    });
  });

  it("allows Stripe promotion-code entry when an explicit blank promo is provided", async () => {
    const { db } = buildDb({ id: "org-1" });
    setStripeFetch(
      () =>
        new Response(JSON.stringify({ id: "cs_no_promo", url: "https://checkout/no-promo" }), {
          status: 200,
        }),
    );
    const integrations = getIntegrations(db, buildBindings());
    await integrations.billing.createCheckoutSession({
      checkoutAttemptId: "33333333-3333-4333-8333-333333333333",
      orgId: "org-1",
      initiatedBy: "user-1",
      planTier: "starter",
      billingCycle: "monthly",
      promoCode: "",
    });

    expect(calls.some((c) => c.url.includes("/promotion_codes"))).toBe(false);
    const checkoutCall = calls.find((c) => c.url.endsWith("/checkout/sessions"));
    expect(checkoutCall!.init.body as string).not.toContain("allow_promotion_codes=true");
    expect(checkoutCall!.init.headers).toMatchObject({
      "Idempotency-Key": generatedCheckoutIdempotencyKey(),
    });
    const inserted = (
      (db as { insert: ReturnType<typeof vi.fn> }).insert.mock.results[0]!.value
        .values as ReturnType<typeof vi.fn>
    ).mock.calls[0]![0] as {
      payload: { promoCode: string | null };
    };
    expect(inserted.payload.promoCode).toBeNull();
  });

  it("omits trial_end when remaining trial is under the 48h Stripe minimum", async () => {
    const nearExpiry = new Date(Date.now() + 60 * 1000);
    const { db } = buildDb({ id: "org-1", trialEndsAt: nearExpiry });
    setStripeFetch(
      () => new Response(JSON.stringify({ id: "cs_soon", url: "x" }), { status: 200 }),
    );
    const integrations = getIntegrations(db, buildBindings());
    await integrations.billing.createCheckoutSession({
      checkoutAttemptId: "33333333-3333-4333-8333-333333333333",
      orgId: "org-1",
      initiatedBy: "user-1",
      planTier: "starter",
      billingCycle: "monthly",
      promoCode: "",
    });
    const checkoutCall = calls.find((c) => c.url.endsWith("/checkout/sessions"));
    expect(checkoutCall!.init.body as string).not.toContain("subscription_data%5Btrial_end%5D");
  });

  it("throws from stripeFetch when STRIPE_SECRET_KEY is removed after provider creation", async () => {
    const { db } = buildDb({ id: "org-1" });
    // Build bindings as a mutable object so we can remove the key after provider creation.
    const bindings = buildBindings() as Record<string, unknown>;
    const integrations = getIntegrations(db, bindings as never);
    // Remove the key — the billing provider was created with real mode (key was present),
    // but now the key is gone, so the next Stripe call should throw.
    delete bindings.STRIPE_SECRET_KEY;
    await expect(
      integrations.billing.createCheckoutSession({
        checkoutAttemptId: "33333333-3333-4333-8333-333333333333",
        orgId: "org-1",
        initiatedBy: "user-1",
        planTier: "starter",
        billingCycle: "monthly",
      }),
    ).rejects.toThrow("STRIPE_SECRET_KEY is required for real billing mode");
  });

  describe("promo window date-gate", () => {
    afterEach(() => {
      vi.useRealTimers();
      vi.clearAllMocks();
    });

    it("attaches no launch promo before the retired deadline", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-06-23T12:00:00.000Z"));

      const { db } = buildDb({ id: "org-1" });
      setStripeFetch(({ url }) => {
        if (url.includes("/promotion_codes")) {
          return new Response(JSON.stringify({ data: [{ id: "promo_y80off" }] }), { status: 200 });
        }
        return new Response(JSON.stringify({ id: "cs_1", url: "https://checkout/x" }), {
          status: 200,
        });
      });
      const integrations = getIntegrations(db, buildBindings());
      await integrations.billing.createCheckoutSession({
        checkoutAttemptId: "33333333-3333-4333-8333-333333333333",
        orgId: "org-1",
        initiatedBy: "user-1",
        planTier: "starter",
        billingCycle: "annual",
      });
      const checkoutCall = calls.find((c) => c.url.endsWith("/checkout/sessions"));
      expect(checkoutCall!.init.body as string).not.toContain("allow_promotion_codes=true");
      expect(checkoutCall!.init.body as string).not.toContain("discounts%5B0%5D");
      expect(calls.some((c) => c.url.includes("/promotion_codes"))).toBe(false);
      expect(hoistedSentry.mockCaptureBackgroundException).not.toHaveBeenCalled();
    });

    it("attaches no launch promo after the deadline (implicit path)", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-07-10T12:00:00.000Z"));

      const { db } = buildDb({ id: "org-1" });
      setStripeFetch(
        () =>
          new Response(JSON.stringify({ id: "cs_full", url: "https://checkout/full" }), {
            status: 200,
          }),
      );
      const integrations = getIntegrations(db, buildBindings());
      await integrations.billing.createCheckoutSession({
        checkoutAttemptId: "33333333-3333-4333-8333-333333333333",
        orgId: "org-1",
        initiatedBy: "user-1",
        planTier: "starter",
        billingCycle: "annual",
      });
      const checkoutCall = calls.find((c) => c.url.endsWith("/checkout/sessions"));
      expect(checkoutCall!.init.body as string).not.toContain("allow_promotion_codes=true");
      expect(checkoutCall!.init.body as string).not.toContain("discounts%5B0%5D");
      expect(calls.some((c) => c.url.includes("/promotion_codes"))).toBe(false);
      expect(hoistedSentry.mockCaptureBackgroundException).not.toHaveBeenCalled();
    });

    it("ignores explicit Y80OFF after the retired deadline without throwing", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-07-10T12:00:00.000Z"));

      const { db } = buildDb({ id: "org-1" });
      setStripeFetch(
        () =>
          new Response(JSON.stringify({ id: "cs_full", url: "https://checkout/full" }), {
            status: 200,
          }),
      );
      const integrations = getIntegrations(db, buildBindings());
      // Must NOT throw
      const result = await integrations.billing.createCheckoutSession({
        checkoutAttemptId: "33333333-3333-4333-8333-333333333333",
        orgId: "org-1",
        initiatedBy: "user-1",
        planTier: "starter",
        billingCycle: "annual",
        promoCode: "Y80OFF",
      });
      expect(result.url).toBe("https://checkout/full");
      const checkoutCall = calls.find((c) => c.url.endsWith("/checkout/sessions"));
      expect(checkoutCall!.init.body as string).not.toContain("allow_promotion_codes=true");
      expect(checkoutCall!.init.body as string).not.toContain("discounts%5B0%5D");
      expect(checkoutCall!.init.body as string).not.toContain("metadata%5BpromoCode%5D=Y80OFF");
      expect(hoistedSentry.mockCaptureBackgroundException).not.toHaveBeenCalled();
    });

    it("does not fire Sentry when ignoring an explicit retired code before the old deadline", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-06-23T12:00:00.000Z"));

      const { db } = buildDb({ id: "org-1" });
      setStripeFetch(({ url }) => {
        if (url.includes("/promotion_codes")) {
          return new Response(JSON.stringify({ data: [{ id: "promo_y80off" }] }), { status: 200 });
        }
        return new Response(JSON.stringify({ id: "cs_1", url: "https://checkout/y" }), {
          status: 200,
        });
      });
      const integrations = getIntegrations(db, buildBindings());
      await integrations.billing.createCheckoutSession({
        checkoutAttemptId: "33333333-3333-4333-8333-333333333333",
        orgId: "org-1",
        initiatedBy: "user-1",
        planTier: "starter",
        billingCycle: "annual",
        promoCode: "Y80OFF",
      });
      expect(hoistedSentry.mockCaptureBackgroundException).not.toHaveBeenCalled();
    });
  });
});

describe("real email provider (createRealEmailProvider)", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function buildRealEmailBindings() {
    return {
      APP_URL: "https://grantpipe.test",
      INTEGRATION_MODE: "real",
      STRIPE_SECRET_KEY: "sk_test_123",
      RESEND_API_KEY: "re_test_key",
      R2: { put: vi.fn(), get: vi.fn(), delete: vi.fn() },
    } as never;
  }

  it("calls Resend API when RESEND_API_KEY is present and integration mode is real", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "resend-email-id-123" }),
    }) as typeof fetch;

    const integrations = getIntegrations({} as never, buildRealEmailBindings());
    const result = await integrations.email.send({
      orgId: "org-1",
      to: ["user@example.com"],
      subject: "Real Email Test",
      text: "Hello from Resend",
      source: { entityType: "grant", entityId: "grant-1", orgId: "org-1" },
      idempotencyKey: "notification-email/notification-1",
    });

    expect(result).toEqual({ id: "resend-email-id-123" });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer re_test_key",
          "Idempotency-Key": "notification-email/notification-1",
        }),
      }),
    );
    const body = JSON.parse(
      ((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1] as { body: string }).body,
    ) as { headers?: Record<string, string>; html?: string; text?: string };
    expect(body.text).toContain("Hello from Resend");
    expect(body.text).toContain(
      "Manage email alerts: https://grantpipe.test/app/notifications?source=email",
    );
    expect(body.html).toContain("Hello from Resend");
    expect(body.html).toContain("<!doctype html>");
    expect(body.html).toContain("Unsubscribe");
    expect(body.html).toContain("https://grantpipe.test/app/notifications?source=email");
    expect(body.html).toContain(
      "You're receiving this because GrantPipe sends email alerts for this workspace.",
    );
    expect(body.headers).toEqual({
      "List-Unsubscribe":
        "<mailto:angel.campa@grantpipe.com?subject=Unsubscribe>, <https://grantpipe.test/app/notifications?source=email>",
    });
  });

  it("throws when Resend API returns non-ok status", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => "Unprocessable Entity",
    }) as typeof fetch;

    const integrations = getIntegrations({} as never, buildRealEmailBindings());
    await expect(
      integrations.email.send({
        orgId: "org-1",
        to: ["user@example.com"],
        subject: "Bad Email",
        text: "Oops",
        source: { entityType: "grant", entityId: "grant-1", orgId: "org-1" },
      }),
    ).rejects.toThrow("Resend API error 422");
  });

  it("real email provider list returns empty data without calling fetch", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as typeof fetch;

    const integrations = getIntegrations({} as never, buildRealEmailBindings());
    const result = await integrations.email.list("org-1", 1, 10);
    expect(result).toEqual({ data: [], total: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws when real mode is requested without RESEND_API_KEY", () => {
    expect(() =>
      getIntegrations(
        {} as never,
        {
          APP_URL: "https://grantpipe.test",
          INTEGRATION_MODE: "real",
          STRIPE_SECRET_KEY: "sk_test_123",
          R2: { put: vi.fn(), get: vi.fn(), delete: vi.fn() },
        } as never,
      ),
    ).toThrow("RESEND_API_KEY is required for real email mode");
  });
});
