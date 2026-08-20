import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockInit = vi.fn();
const mockIdentify = vi.fn();
const mockGroup = vi.fn();
const mockReset = vi.fn();
const mockCreatePersonProfile = vi.fn();
const mockCapture = vi.fn();
const mockTrackBingUetEvent = vi.fn();
const mockMergeStoredPaidAttribution = vi.fn(
  (properties?: Record<string, unknown>) => properties ?? {},
);

vi.mock("posthog-js", () => ({
  default: {
    init: mockInit,
    identify: mockIdentify,
    group: mockGroup,
    reset: mockReset,
    createPersonProfile: mockCreatePersonProfile,
    capture: mockCapture,
  },
}));

vi.mock("./bing-uet", () => ({
  trackBingUetEvent: (...args: unknown[]) => mockTrackBingUetEvent(...args),
}));

vi.mock("./paid-attribution", () => ({
  mergeStoredPaidAttribution: (properties?: Record<string, unknown>) =>
    mockMergeStoredPaidAttribution(properties),
}));

describe("analytics", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    mockInit.mockClear();
    mockIdentify.mockClear();
    mockGroup.mockClear();
    mockReset.mockClear();
    mockCreatePersonProfile.mockClear();
    mockCapture.mockClear();
    mockTrackBingUetEvent.mockClear();
    mockMergeStoredPaidAttribution.mockClear();
    window.localStorage.clear();
    mockMergeStoredPaidAttribution.mockImplementation(
      (properties?: Record<string, unknown>) => properties ?? {},
    );
  });

  describe("initAnalytics", () => {
    it("does NOT call posthog.init when VITE_POSTHOG_KEY is unset", async () => {
      const { initAnalytics } = await import("./analytics");
      initAnalytics();
      expect(mockInit).not.toHaveBeenCalled();
    });

    it("does NOT call posthog.init when VITE_POSTHOG_KEY is blank", async () => {
      vi.stubEnv("VITE_POSTHOG_KEY", "");
      vi.stubEnv("VITE_POSTHOG_HOST", " ");
      const { initAnalytics } = await import("./analytics");
      initAnalytics();
      expect(mockInit).not.toHaveBeenCalled();
    });

    it("does NOT call posthog.init when VITE_POSTHOG_KEY is whitespace only", async () => {
      vi.stubEnv("VITE_POSTHOG_KEY", "   ");
      const { initAnalytics } = await import("./analytics");
      initAnalytics();
      expect(mockInit).not.toHaveBeenCalled();
    });

    it("never initialises posthog with the old hardcoded fallback key", async () => {
      const HARDCODED_KEY = "phc_examplePostHogProjectKey0000000000000000";
      const { initAnalytics } = await import("./analytics");
      initAnalytics();
      for (const call of mockInit.mock.calls) {
        expect(call[0]).not.toBe(HARDCODED_KEY);
      }
    });

    it("uses VITE_POSTHOG_KEY and VITE_POSTHOG_HOST when provided via env", async () => {
      vi.stubEnv("VITE_POSTHOG_KEY", "phc_custom_key");
      vi.stubEnv("VITE_POSTHOG_HOST", "https://eu.i.posthog.com");
      const { initAnalytics } = await import("./analytics");
      initAnalytics();
      expect(mockInit).toHaveBeenCalledWith(
        "phc_custom_key",
        expect.objectContaining({ api_host: "https://eu.i.posthog.com" }),
      );
    });

    it("enables replay, autocapture, frustration signals, and privacy filtering", async () => {
      vi.stubEnv("VITE_POSTHOG_KEY", "phc_test_key");
      const { initAnalytics } = await import("./analytics");
      initAnalytics();

      const config = mockInit.mock.calls[0]?.[1] as {
        autocapture?: unknown;
        rageclick?: unknown;
        capture_dead_clicks?: unknown;
        capture_exceptions?: unknown;
        capture_heatmaps?: unknown;
        capture_performance?: unknown;
        mask_all_element_attributes?: unknown;
        mask_all_text?: unknown;
        mask_personal_data_properties?: unknown;
        custom_personal_data_properties?: string[];
        session_recording?: Record<string, unknown>;
        before_send?: (event: { event?: string; properties?: Record<string, unknown> }) => {
          event?: string;
          properties?: Record<string, unknown>;
        } | null;
      };

      expect(config).toMatchObject({
        autocapture: { dom_event_allowlist: ["click", "change", "submit"] },
        disable_compression: true,
        rageclick: true,
        capture_dead_clicks: true,
        capture_performance: { web_vitals: true, network_timing: false },
        capture_exceptions: {
          capture_unhandled_errors: true,
          capture_unhandled_rejections: true,
          capture_console_errors: true,
        },
        capture_heatmaps: true,
        mask_all_element_attributes: true,
        mask_all_text: true,
        // PostHog's blanket personal-data masking is OFF: it nulls $current_url,
        // $pathname, and every referrer property, which blinds URL-based funnels.
        // PII is instead stripped by the before_send hook (asserted below), which
        // redacts emails/tokens/invite params and entity IDs while preserving the
        // route path funnels need.
        mask_personal_data_properties: false,
        person_profiles: "identified_only",
      });
      // custom_personal_data_properties only has meaning while masking is on, so it
      // must not be configured once the blanket mask is disabled.
      expect(config.custom_personal_data_properties).toBeUndefined();
      expect(config.session_recording).toMatchObject({
        maskAllInputs: true,
        maskTextSelector: "*",
        blockSelector: "[data-ph-block], .ph-block, [data-sensitive]",
        recordHeaders: false,
        recordBody: false,
      });

      const sanitized = config.before_send?.({
        event: "$autocapture",
        properties: {
          email: "person@example.org",
          token: "raw-token",
          invite: "raw-invite",
          password: "secret",
          page_path: "/signup",
        },
      });

      expect(sanitized?.properties).toMatchObject({
        email: "[redacted]",
        token: "[redacted]",
        invite: "[redacted]",
        password: "[redacted]",
        page_path: "/signup",
      });
    });

    it("preserves the configured PostHog project token needed for SDK ingestion", async () => {
      vi.stubEnv("VITE_POSTHOG_KEY", "phc_test_key");
      const { initAnalytics } = await import("./analytics");
      initAnalytics();

      const config = mockInit.mock.calls[0]?.[1] as {
        before_send?: (event: { event?: string; properties?: Record<string, unknown> }) => {
          event?: string;
          properties?: Record<string, unknown>;
        } | null;
      };

      const sdkEvent = config.before_send?.({
        event: "outbound_landing_viewed",
        properties: {
          token: "phc_test_key",
          ve_campaign_id: "grantpipe-grants-deadline-drift-2026_06-01",
        },
      });
      const appTokenEvent = config.before_send?.({
        event: "custom_app_event",
        properties: {
          token: "invite-token-123",
          ve_campaign_id: "grantpipe-grants-deadline-drift-2026_06-01",
        },
      });

      expect(sdkEvent?.properties).toMatchObject({
        token: "phc_test_key",
        ve_campaign_id: "grantpipe-grants-deadline-drift-2026_06-01",
      });
      expect(appTokenEvent?.properties).toMatchObject({
        token: "[redacted]",
        ve_campaign_id: "grantpipe-grants-deadline-drift-2026_06-01",
      });
    });

    it("redacts sensitive URLs in SDK-generated events before sending", async () => {
      vi.stubEnv("VITE_POSTHOG_KEY", "phc_test_key");
      const { initAnalytics } = await import("./analytics");
      initAnalytics();

      const config = mockInit.mock.calls[0]?.[1] as {
        before_send?: (event: { event?: string; properties?: Record<string, unknown> }) => {
          event?: string;
          properties?: Record<string, unknown>;
        } | null;
      };

      const sanitized = config.before_send?.({
        event: "$autocapture",
        properties: {
          $current_url: "https://app.grantpipe.com/app/portal/raw-token-123?token=secret",
          $pathname: "/invite/raw-invite-token",
          $referrer: "https://app.grantpipe.com/login?invite=invite-token-123",
        },
      });

      expect(sanitized?.properties).toMatchObject({
        $current_url: "https://app.grantpipe.com/app/portal/[redacted]?token=%5Bredacted%5D",
        $pathname: "/invite/[redacted]",
        $referrer: "https://app.grantpipe.com/login?invite=%5Bredacted%5D",
      });
    });

    it("normalizes generic entity IDs in URL-like analytics properties", async () => {
      vi.stubEnv("VITE_POSTHOG_KEY", "phc_test_key");
      const { initAnalytics } = await import("./analytics");
      initAnalytics();

      const config = mockInit.mock.calls[0]?.[1] as {
        before_send?: (event: { event?: string; properties?: Record<string, unknown> }) => {
          event?: string;
          properties?: Record<string, unknown>;
        } | null;
      };

      const sanitized = config.before_send?.({
        event: "$pageview",
        properties: {
          current_path: "/app/contacts/cmf4d9k8t0000kx08p7b2q1m9",
          destination_path: "/app/grants/550e8400-e29b-41d4-a716-446655440000/edit",
          return_path: "/app/documents/507f1f77bcf86cd799439011?contactId=abc123def4567890",
          href: "https://app.grantpipe.com/app/funds/fund-123456789012345?payment_request_id=payreq_123456789012",
        },
      });

      expect(sanitized?.properties).toMatchObject({
        current_path: "/app/contacts/[redacted-id]",
        destination_path: "/app/grants/[redacted-id]/edit",
        return_path: "/app/documents/[redacted-id]?contactId=%5Bredacted-id%5D",
        href: "https://app.grantpipe.com/app/funds/[redacted-id]?payment_request_id=%5Bredacted-id%5D",
      });
    });

    it("redacts email query params in URL-like analytics properties", async () => {
      vi.stubEnv("VITE_POSTHOG_KEY", "phc_test_key");
      const { initAnalytics } = await import("./analytics");
      initAnalytics();

      const config = mockInit.mock.calls[0]?.[1] as {
        before_send?: (event: { event?: string; properties?: Record<string, unknown> }) => {
          event?: string;
          properties?: Record<string, unknown>;
        } | null;
      };

      const sanitized = config.before_send?.({
        event: "outbound_signup_completed",
        properties: {
          landing_path: "/signup?email=person@example.org&recipient_email=owner@example.org",
          target_url: "https://app.grantpipe.com/signup?contactEmail=lead@example.org",
        },
      });

      expect(sanitized?.properties).toMatchObject({
        landing_path: "/signup?email=%5Bredacted-email%5D&recipient_email=%5Bredacted-email%5D",
        target_url: "https://app.grantpipe.com/signup?contactEmail=%5Bredacted-email%5D",
      });
      expect(JSON.stringify(sanitized)).not.toContain("person@example.org");
      expect(JSON.stringify(sanitized)).not.toContain("owner@example.org");
      expect(JSON.stringify(sanitized)).not.toContain("lead@example.org");
    });

    it("redacts autocapture hrefs and nested element metadata before sending", async () => {
      vi.stubEnv("VITE_POSTHOG_KEY", "phc_test_key");
      const { initAnalytics } = await import("./analytics");
      initAnalytics();

      const config = mockInit.mock.calls[0]?.[1] as {
        before_send?: (event: { event?: string; properties?: Record<string, unknown> }) => {
          event?: string;
          properties?: Record<string, unknown>;
        } | null;
      };

      const sanitized = config.before_send?.({
        event: "$autocapture",
        properties: {
          attr__href: "https://app.grantpipe.com/invite/raw-token-123?token=secret",
          $external_click_url: "https://app.grantpipe.com/portal/review?token=portal-token",
          $elements_chain: 'a.attr__href="https://app.grantpipe.com/invite/raw-token"',
          $elements: [
            {
              attr__href: "https://app.grantpipe.com/app/portal/raw-token-123?token=secret",
            },
          ],
        },
      });

      expect(sanitized?.properties).toMatchObject({
        attr__href: "https://app.grantpipe.com/invite/[redacted]?token=%5Bredacted%5D",
        $external_click_url: "https://app.grantpipe.com/portal/review?token=%5Bredacted%5D",
        $elements_chain: 'a.attr__href="https://app.grantpipe.com/invite/[redacted]"',
        $elements: [
          {
            attr__href: "https://app.grantpipe.com/app/portal/[redacted]?token=%5Bredacted%5D",
          },
        ],
      });
    });

    it("redacts sensitive exception and console strings before sending", async () => {
      vi.stubEnv("VITE_POSTHOG_KEY", "phc_test_key");
      const { initAnalytics } = await import("./analytics");
      initAnalytics();

      const config = mockInit.mock.calls[0]?.[1] as {
        before_send?: (event: { event?: string; properties?: Record<string, unknown> }) => {
          event?: string;
          properties?: Record<string, unknown>;
        } | null;
      };

      const sanitized = config.before_send?.({
        event: "$exception",
        properties: {
          $exception_message:
            "Failed invite /invite/raw-token-123 for jane@example.org with token=secret",
          $exception_stack:
            "Error at https://app.grantpipe.com/app/portal/raw-token-123?invite=invite-token",
          console_args: [
            "portal token",
            "https://app.grantpipe.com/portal/review?token=portal-token",
          ],
        },
      });

      expect(sanitized?.properties).toMatchObject({
        $exception_message: "[redacted]",
        $exception_stack: "[redacted]",
        console_args: "[redacted]",
      });
    });

    it("drops raw non-URL exception text before sending SDK-generated events", async () => {
      vi.stubEnv("VITE_POSTHOG_KEY", "phc_test_key");
      const { initAnalytics } = await import("./analytics");
      initAnalytics();

      const config = mockInit.mock.calls[0]?.[1] as {
        before_send?: (event: { event?: string; properties?: Record<string, unknown> }) => {
          event?: string;
          properties?: Record<string, unknown>;
        } | null;
      };

      const sanitized = config.before_send?.({
        event: "$exception",
        properties: {
          $exception_message: "Donor Jane Smith failed Grant Alpha upload",
          $exception_type: "ApiError",
          message: "CSV row included Jane Smith",
        },
      });

      expect(sanitized?.properties).toMatchObject({
        $exception_message: "[redacted]",
        $exception_type: "ApiError",
        message: "[redacted]",
      });
    });

    it("redacts banned raw text property keys while preserving safe dimensions", async () => {
      vi.stubEnv("VITE_POSTHOG_KEY", "phc_test_key");
      const { initAnalytics } = await import("./analytics");
      initAnalytics();

      const config = mockInit.mock.calls[0]?.[1] as {
        before_send?: (event: { event?: string; properties?: Record<string, unknown> }) => {
          event?: string;
          properties?: Record<string, unknown>;
        } | null;
      };

      const sanitized = config.before_send?.({
        event: "document_selected",
        properties: {
          name: "Jane Smith",
          phone: "555-0101",
          phone_number: "555-0102",
          filename: "award-letter.pdf",
          file_name: "grant-budget.xlsx",
          title: "Grant Alpha report",
          report_title: "Board packet",
          document_title: "Signed agreement",
          query: "Jane Smith gifts",
          search: "private search",
          search_text: "restricted program",
          fileName: "award-letter.pdf",
          documentTitle: "Signed agreement",
          reportTitle: "Board packet",
          searchText: "restricted program",
          phoneNumber: "555-0103",
          step_name: "review",
          query_length_bucket: "short",
          result_count_bucket: "10_25",
          mime_family: "pdf",
        },
      });

      expect(sanitized?.properties).toMatchObject({
        name: "[redacted]",
        phone: "[redacted]",
        phone_number: "[redacted]",
        filename: "[redacted]",
        file_name: "[redacted]",
        title: "[redacted]",
        report_title: "[redacted]",
        document_title: "[redacted]",
        query: "[redacted]",
        search: "[redacted]",
        search_text: "[redacted]",
        fileName: "[redacted]",
        documentTitle: "[redacted]",
        reportTitle: "[redacted]",
        searchText: "[redacted]",
        phoneNumber: "[redacted]",
        step_name: "review",
        query_length_bucket: "short",
        result_count_bucket: "10_25",
        mime_family: "pdf",
      });
    });

    it("leaves null, missing properties, and primitive properties safe in before_send", async () => {
      vi.stubEnv("VITE_POSTHOG_KEY", "phc_test_key");
      const { initAnalytics } = await import("./analytics");
      initAnalytics();

      const config = mockInit.mock.calls[0]?.[1] as {
        before_send?: (
          event: {
            event?: string;
            properties?: Record<string, unknown>;
          } | null,
        ) => {
          event?: string;
          properties?: Record<string, unknown>;
        } | null;
      };

      const withoutProperties = { event: "$pageview" };
      const withPrimitive = {
        event: "$exception",
        properties: {
          attempts: 2,
          succeeded: false,
          empty: null,
        },
      };

      expect(config.before_send?.(null)).toBeNull();
      expect(config.before_send?.(withoutProperties)).toBe(withoutProperties);
      expect(config.before_send?.(withPrimitive)?.properties).toMatchObject({
        attempts: 2,
        succeeded: false,
        empty: null,
      });
    });

    it("redacts malformed URL-like properties with regex fallback", async () => {
      vi.stubEnv("VITE_POSTHOG_KEY", "phc_test_key");
      const { initAnalytics } = await import("./analytics");
      initAnalytics();

      const config = mockInit.mock.calls[0]?.[1] as {
        before_send?: (event: { event?: string; properties?: Record<string, unknown> }) => {
          event?: string;
          properties?: Record<string, unknown>;
        } | null;
      };

      const sanitized = config.before_send?.({
        event: "$autocapture",
        properties: {
          attr__href: "http://[bad/app/portal/raw-token?token=secret",
        },
      });

      expect(sanitized?.properties).toMatchObject({
        attr__href: "http://[bad/app/portal/[redacted]?token=[redacted]",
      });
    });

    it("falls back to the default host when VITE_POSTHOG_HOST is unset", async () => {
      vi.stubEnv("VITE_POSTHOG_KEY", "phc_key_only");
      // VITE_POSTHOG_HOST is deliberately not stubbed
      const { initAnalytics } = await import("./analytics");
      initAnalytics();
      expect(mockInit).toHaveBeenCalledWith(
        "phc_key_only",
        expect.objectContaining({ api_host: "https://us.i.posthog.com" }),
      );
    });

    it("does not throw when posthog.init throws", async () => {
      mockInit.mockImplementationOnce(() => {
        throw new Error("init failure");
      });
      const { initAnalytics } = await import("./analytics");
      expect(() => initAnalytics()).not.toThrow();
    });
  });

  describe("identifyUser", () => {
    it("calls posthog.identify with mapped properties", async () => {
      const { identifyUser } = await import("./analytics");
      identifyUser("user-1", {
        email: "a@example.com",
        orgId: "org-1",
        activeEntityId: "entity-1",
        activeEntityName: "Client Name Must Not Leak",
        name: "Alice",
        member_role: "admin",
        plan_tier: "growth",
        subscription_status: "trialing",
      });
      expect(mockIdentify).toHaveBeenCalledWith("user-1", {
        org_id: "org-1",
        active_entity_id: "entity-1",
        member_role: "admin",
        plan_tier: "growth",
        subscription_status: "trialing",
      });
      expect(mockGroup).toHaveBeenCalledWith("organization", "org-1", {
        plan_tier: "growth",
        subscription_status: "trialing",
      });
      expect(mockGroup).toHaveBeenCalledWith("entity", "entity-1", {
        org_id: "org-1",
      });
      expect(JSON.stringify(mockIdentify.mock.calls)).not.toContain("Client Name Must Not Leak");
      expect(JSON.stringify(mockGroup.mock.calls)).not.toContain("Client Name Must Not Leak");
    });

    it("omits org_id when orgId is null", async () => {
      const { identifyUser } = await import("./analytics");
      identifyUser("user-2", { email: "b@example.com", orgId: null });
      expect(mockIdentify).toHaveBeenCalledWith("user-2", {
        org_id: undefined,
        active_entity_id: undefined,
        member_role: undefined,
        plan_tier: undefined,
        subscription_status: undefined,
      });
      expect(mockGroup).not.toHaveBeenCalled();
    });

    it("does not throw when posthog.identify throws", async () => {
      mockIdentify.mockImplementationOnce(() => {
        throw new Error("network failure");
      });
      const { identifyUser } = await import("./analytics");
      expect(() => identifyUser("u", {})).not.toThrow();
    });

    it("does not throw when posthog.group throws", async () => {
      mockGroup.mockImplementationOnce(() => {
        throw new Error("group failure");
      });
      const { identifyUser } = await import("./analytics");
      expect(() => identifyUser("u", { orgId: "org-1" })).not.toThrow();
    });
  });

  describe("resetAnalytics", () => {
    it("calls posthog.reset", async () => {
      const { resetAnalytics } = await import("./analytics");
      resetAnalytics();
      expect(mockReset).toHaveBeenCalledOnce();
    });

    it("does not throw when posthog.reset throws", async () => {
      mockReset.mockImplementationOnce(() => {
        throw new Error("internal error");
      });
      const { resetAnalytics } = await import("./analytics");
      expect(() => resetAnalytics()).not.toThrow();
    });
  });

  describe("createAnonymousPersonProfile", () => {
    it("creates a person profile for anonymous campaign attribution", async () => {
      const { createAnonymousPersonProfile } = await import("./analytics");

      createAnonymousPersonProfile();

      expect(mockCreatePersonProfile).toHaveBeenCalledTimes(1);
    });

    it("does not throw when profile creation fails", async () => {
      mockCreatePersonProfile.mockImplementationOnce(() => {
        throw new Error("posthog unavailable");
      });
      const { createAnonymousPersonProfile } = await import("./analytics");

      expect(() => createAnonymousPersonProfile()).not.toThrow();
    });
  });

  describe("capturePageview", () => {
    it("captures /invite/token URLs with the token redacted", async () => {
      const { capturePageview } = await import("./analytics");
      capturePageview("https://app.grantpipe.com/invite/abc123");
      expect(mockCapture).toHaveBeenCalledWith(
        "$pageview",
        expect.objectContaining({
          $current_url: "https://app.grantpipe.com/invite/[redacted]",
        }),
      );
    });

    it("captures /dashboard without modification", async () => {
      const { capturePageview } = await import("./analytics");
      capturePageview("/dashboard");
      expect(mockCapture).toHaveBeenCalledWith(
        "$pageview",
        expect.objectContaining({
          $current_url: "/dashboard",
        }),
      );
    });

    it("captures app pageviews with identified org and app context", async () => {
      const { capturePageview, identifyUser } = await import("./analytics");
      identifyUser("user-1", {
        orgId: "org-1",
        member_role: "admin",
        plan_tier: "growth",
        subscription_status: "trialing",
      });

      capturePageview("/dashboard");

      expect(mockCapture).toHaveBeenLastCalledWith("$pageview", {
        $current_url: "/dashboard",
        org_id: "org-1",
        member_role: "admin",
        plan_tier: "growth",
        subscription_status: "trialing",
        app_surface: "app",
        environment: "test",
      });
    });

    it("redacts the token in /invite/:token?query=string URLs", async () => {
      const { capturePageview } = await import("./analytics");
      capturePageview("/invite/tok-xyz?ref=email");
      expect(mockCapture).toHaveBeenCalledWith(
        "$pageview",
        expect.objectContaining({
          $current_url: "/invite/[redacted]?ref=email",
        }),
      );
    });

    it("redacts portal bearer tokens from pageview URLs", async () => {
      const { capturePageview } = await import("./analytics");
      capturePageview("https://app.grantpipe.com/app/portal/raw-token-123?utm=email#top");
      expect(mockCapture).toHaveBeenCalledWith(
        "$pageview",
        expect.objectContaining({
          $current_url: "https://app.grantpipe.com/app/portal/[redacted]?utm=email#top",
        }),
      );
    });

    it("redacts invite query parameters from login and signup pageview URLs", async () => {
      const { capturePageview } = await import("./analytics");
      capturePageview("/login?invite=invite-token-123&next=dashboard#form");
      expect(mockCapture).toHaveBeenCalledWith(
        "$pageview",
        expect.objectContaining({
          $current_url: "/login?invite=%5Bredacted%5D&next=dashboard#form",
        }),
      );
    });

    it("redacts generic token query parameters from pageview URLs", async () => {
      const { capturePageview } = await import("./analytics");
      capturePageview("/portal/review?token=portal-token-123&next=documents");
      expect(mockCapture).toHaveBeenCalledWith(
        "$pageview",
        expect.objectContaining({
          $current_url: "/portal/review?token=%5Bredacted%5D&next=documents",
        }),
      );
    });

    it("does not throw when posthog.capture throws", async () => {
      mockCapture.mockImplementationOnce(() => {
        throw new Error("capture error");
      });
      const { capturePageview } = await import("./analytics");
      expect(() => capturePageview("/dashboard")).not.toThrow();
    });
  });

  describe("POSTHOG_PENDING_EVENT_KEY", () => {
    it("exports the localStorage key used for cross-navigation event bridging", async () => {
      const { POSTHOG_PENDING_EVENT_KEY } = await import("./analytics");
      expect(POSTHOG_PENDING_EVENT_KEY).toBe("posthog_pending_event");
    });
  });

  describe("pending analytics events bridge", () => {
    it("stores a single pending event in localStorage with a TTL and reads it back once", async () => {
      const {
        storePendingAnalyticsEvents,
        consumePendingAnalyticsEvents,
        POSTHOG_PENDING_EVENT_KEY,
      } = await import("./analytics");

      storePendingAnalyticsEvents({
        event: "signup_completed",
        properties: { method: "google", utm_source: "bing" },
      });

      // Persisted to localStorage (survives an OAuth redirect), not sessionStorage.
      expect(window.localStorage.getItem(POSTHOG_PENDING_EVENT_KEY)).not.toBeNull();
      expect(window.sessionStorage.getItem(POSTHOG_PENDING_EVENT_KEY)).toBeNull();

      const first = consumePendingAnalyticsEvents();
      expect(first).toEqual([
        { event: "signup_completed", properties: { method: "google", utm_source: "bing" } },
      ]);

      // One-shot: a second consume returns nothing and the key is cleared.
      expect(consumePendingAnalyticsEvents()).toEqual([]);
      expect(window.localStorage.getItem(POSTHOG_PENDING_EVENT_KEY)).toBeNull();
    });

    it("stores and reads back a multi-event payload", async () => {
      const { storePendingAnalyticsEvents, consumePendingAnalyticsEvents } =
        await import("./analytics");

      const properties = { method: "google", ve_campaign_id: "cmp_123" };
      storePendingAnalyticsEvents({
        events: [
          { event: "signup_completed", properties },
          { event: "outbound_signup_completed", properties },
        ],
      });

      expect(consumePendingAnalyticsEvents()).toEqual([
        { event: "signup_completed", properties },
        { event: "outbound_signup_completed", properties },
      ]);
    });

    it("clears the pending event after consume", async () => {
      const {
        storePendingAnalyticsEvents,
        clearPendingAnalyticsEvents,
        POSTHOG_PENDING_EVENT_KEY,
      } = await import("./analytics");

      storePendingAnalyticsEvents({ event: "signup_completed", properties: { method: "google" } });
      clearPendingAnalyticsEvents();
      expect(window.localStorage.getItem(POSTHOG_PENDING_EVENT_KEY)).toBeNull();
    });

    it("drops an expired pending event without returning it", async () => {
      vi.useFakeTimers();
      try {
        const { storePendingAnalyticsEvents, consumePendingAnalyticsEvents } =
          await import("./analytics");
        storePendingAnalyticsEvents({
          event: "signup_completed",
          properties: { method: "google" },
        });
        // Advance well past the 30-minute TTL.
        vi.advanceTimersByTime(31 * 60 * 1000);
        expect(consumePendingAnalyticsEvents()).toEqual([]);
      } finally {
        vi.useRealTimers();
      }
    });

    it("returns no events when nothing is stored", async () => {
      const { consumePendingAnalyticsEvents } = await import("./analytics");
      expect(consumePendingAnalyticsEvents()).toEqual([]);
    });

    it("ignores malformed stored JSON", async () => {
      const { consumePendingAnalyticsEvents, POSTHOG_PENDING_EVENT_KEY } =
        await import("./analytics");
      window.localStorage.setItem(POSTHOG_PENDING_EVENT_KEY, "not-json");
      expect(consumePendingAnalyticsEvents()).toEqual([]);
    });

    it("ignores a stored value with no recognizable events", async () => {
      const { consumePendingAnalyticsEvents, POSTHOG_PENDING_EVENT_KEY } =
        await import("./analytics");
      window.localStorage.setItem(
        POSTHOG_PENDING_EVENT_KEY,
        JSON.stringify({ payload: { nonsense: true }, expiresAt: Date.now() + 1000 }),
      );
      expect(consumePendingAnalyticsEvents()).toEqual([]);
    });

    it("does not throw when localStorage.setItem fails during store", async () => {
      const { storePendingAnalyticsEvents } = await import("./analytics");
      const setItemSpy = vi.spyOn(window.localStorage, "setItem").mockImplementationOnce(() => {
        throw new Error("storage full");
      });
      expect(() =>
        storePendingAnalyticsEvents({
          event: "signup_completed",
          properties: { method: "google" },
        }),
      ).not.toThrow();
      setItemSpy.mockRestore();
    });

    it("does not throw when localStorage.removeItem fails during consume", async () => {
      const { storePendingAnalyticsEvents, consumePendingAnalyticsEvents } =
        await import("./analytics");
      storePendingAnalyticsEvents({ event: "signup_completed", properties: { method: "google" } });
      const removeItemSpy = vi
        .spyOn(window.localStorage, "removeItem")
        .mockImplementationOnce(() => {
          throw new Error("storage error");
        });
      expect(() => consumePendingAnalyticsEvents()).not.toThrow();
      removeItemSpy.mockRestore();
    });

    it("returns nothing — and never re-fires — when the clear during consume fails", async () => {
      const { storePendingAnalyticsEvents, consumePendingAnalyticsEvents } =
        await import("./analytics");
      storePendingAnalyticsEvents({ event: "signup_completed", properties: { method: "google" } });

      // The removeItem during the first consume throws, so the value is still in
      // storage. The events must NOT be returned, otherwise a later consume (which
      // succeeds at clearing) would re-fire the same completion event.
      const removeItemSpy = vi
        .spyOn(window.localStorage, "removeItem")
        .mockImplementationOnce(() => {
          throw new Error("storage error");
        });
      expect(consumePendingAnalyticsEvents()).toEqual([]);
      removeItemSpy.mockRestore();

      // The value is still stored, but the events were never handed out, so a
      // successful second consume returns them exactly once and clears them.
      expect(consumePendingAnalyticsEvents()).toEqual([
        { event: "signup_completed", properties: { method: "google" } },
      ]);
      expect(consumePendingAnalyticsEvents()).toEqual([]);
    });
  });

  describe("pending-event OAuth-return URL marker", () => {
    const realLocation = window.location;
    const realReplaceState = window.history.replaceState;

    beforeEach(() => {
      Object.defineProperty(window, "location", {
        configurable: true,
        writable: true,
        value: new URL("https://app.grantpipe.com/app/onboarding"),
      });
      window.history.replaceState = realReplaceState;
    });

    afterEach(() => {
      Object.defineProperty(window, "location", {
        configurable: true,
        writable: true,
        value: realLocation,
      });
      window.history.replaceState = realReplaceState;
    });

    it("exports the marker query-param key", async () => {
      const { POSTHOG_PENDING_EVENT_MARKER } = await import("./analytics");
      expect(POSTHOG_PENDING_EVENT_MARKER).toBe("ph_pending");
    });

    it("appends the marker to a marker-less callback path", async () => {
      const { appendPendingEventMarker } = await import("./analytics");
      expect(appendPendingEventMarker("/app/onboarding")).toBe("/app/onboarding?ph_pending=1");
    });

    it("appends the marker with & when the callback already has a query string", async () => {
      const { appendPendingEventMarker } = await import("./analytics");
      expect(appendPendingEventMarker("/app/onboarding?ref=email")).toBe(
        "/app/onboarding?ref=email&ph_pending=1",
      );
    });

    it("does not duplicate the marker if it is already present", async () => {
      const { appendPendingEventMarker } = await import("./analytics");
      expect(appendPendingEventMarker("/app/onboarding?ph_pending=1")).toBe(
        "/app/onboarding?ph_pending=1",
      );
    });

    it("returns the callback unchanged when it cannot be parsed", async () => {
      const { appendPendingEventMarker } = await import("./analytics");
      // A protocol-relative value with an invalid host trips the URL parser.
      expect(appendPendingEventMarker("http://[bad")).toBe("http://[bad");
    });

    it("reports the marker as absent on a plain authenticated load", async () => {
      const { hasPendingEventMarker } = await import("./analytics");
      expect(hasPendingEventMarker()).toBe(false);
    });

    it("reports the marker as present on the OAuth return URL", async () => {
      Object.defineProperty(window, "location", {
        configurable: true,
        writable: true,
        value: new URL("https://app.grantpipe.com/app/onboarding?ph_pending=1"),
      });
      const { hasPendingEventMarker } = await import("./analytics");
      expect(hasPendingEventMarker()).toBe(true);
    });

    it("strips the marker via history.replaceState without adding a history entry", async () => {
      Object.defineProperty(window, "location", {
        configurable: true,
        writable: true,
        value: new URL("https://app.grantpipe.com/app/onboarding?ph_pending=1&ref=email"),
      });
      const replaceStateSpy = vi.fn();
      window.history.replaceState = replaceStateSpy;

      const { clearPendingEventMarker } = await import("./analytics");
      clearPendingEventMarker();

      expect(replaceStateSpy).toHaveBeenCalledTimes(1);
      const nextUrl = replaceStateSpy.mock.calls[0]?.[2] as string;
      expect(nextUrl).toBe("/app/onboarding?ref=email");
      expect(nextUrl).not.toContain("ph_pending");
    });

    it("does not call replaceState when there is no marker to strip", async () => {
      const replaceStateSpy = vi.fn();
      window.history.replaceState = replaceStateSpy;

      const { clearPendingEventMarker } = await import("./analytics");
      clearPendingEventMarker();

      expect(replaceStateSpy).not.toHaveBeenCalled();
    });

    it("does not throw when history.replaceState fails while stripping the marker", async () => {
      Object.defineProperty(window, "location", {
        configurable: true,
        writable: true,
        value: new URL("https://app.grantpipe.com/app/onboarding?ph_pending=1"),
      });
      window.history.replaceState = vi.fn(() => {
        throw new Error("history error");
      });

      const { clearPendingEventMarker } = await import("./analytics");
      expect(() => clearPendingEventMarker()).not.toThrow();
    });
  });

  describe("captureEvent", () => {
    it("calls posthog.capture with the event name and properties", async () => {
      const { captureEvent, identifyUser } = await import("./analytics");
      identifyUser("user-1", {
        orgId: "org-1",
        activeEntityId: "entity-1",
        member_role: "editor",
        plan_tier: "growth",
        subscription_status: "trialing",
      });
      captureEvent("my_event", { foo: "bar" });
      expect(mockCapture).toHaveBeenCalledWith("my_event", {
        foo: "bar",
        org_id: "org-1",
        active_entity_id: "entity-1",
        member_role: "editor",
        plan_tier: "growth",
        subscription_status: "trialing",
        app_surface: "app",
        environment: "test",
      });
    });

    it("keeps app and identified user context when event properties are omitted", async () => {
      const { captureEvent, identifyUser } = await import("./analytics");
      identifyUser("user-1", {
        orgId: "org-1",
        member_role: "editor",
        plan_tier: "growth",
        subscription_status: "trialing",
      });
      captureEvent("bare_event");
      expect(mockCapture).toHaveBeenCalledWith("bare_event", {
        org_id: "org-1",
        member_role: "editor",
        plan_tier: "growth",
        subscription_status: "trialing",
        app_surface: "app",
        environment: "test",
      });
    });

    it("merges stored paid attribution into app analytics events", async () => {
      mockMergeStoredPaidAttribution.mockReturnValue({
        utm_source: "bing",
        msclkid: "ms-click-1",
        first_action: "grants",
      });
      const { captureEvent } = await import("./analytics");

      captureEvent("onboarding_completed", { first_action: "grants" });

      expect(mockMergeStoredPaidAttribution).toHaveBeenCalledWith({
        first_action: "grants",
      });
      expect(mockCapture).toHaveBeenCalledWith(
        "onboarding_completed",
        expect.objectContaining({
          utm_source: "bing",
          msclkid: "ms-click-1",
          first_action: "grants",
          app_surface: "app",
          environment: "test",
        }),
      );
    });

    it("passes explicit capture options while keeping app context", async () => {
      const { captureEvent, identifyUser } = await import("./analytics");
      identifyUser("user-1", {
        orgId: "org-1",
        member_role: "editor",
        plan_tier: "growth",
        subscription_status: "trialing",
      });
      captureEvent("instant_event", { foo: "bar" }, { send_instantly: true });
      expect(mockCapture).toHaveBeenCalledWith(
        "instant_event",
        {
          foo: "bar",
          org_id: "org-1",
          member_role: "editor",
          plan_tier: "growth",
          subscription_status: "trialing",
          app_surface: "app",
          environment: "test",
        },
        { send_instantly: true },
      );
    });

    it("sends signup completion events with sendBeacon by default", async () => {
      const { captureEvent } = await import("./analytics");

      captureEvent("outbound_signup_completed", {
        method: "email",
        ve_campaign_id: "grantpipe-grants-deadline-drift-2026_06-01",
      });

      expect(mockCapture).toHaveBeenCalledWith(
        "outbound_signup_completed",
        expect.objectContaining({
          method: "email",
          ve_campaign_id: "grantpipe-grants-deadline-drift-2026_06-01",
          app_surface: "app",
          environment: "test",
        }),
        {
          send_instantly: true,
          transport: "sendBeacon",
        },
      );
    });

    it("forwards conversion events to Bing UET when explicit capture options are used", async () => {
      const { captureEvent } = await import("./analytics");

      captureEvent("signup_completed", { method: "email" }, { send_instantly: true });

      expect(mockTrackBingUetEvent).toHaveBeenCalledWith(
        "signup_completed",
        expect.objectContaining({ method: "email", app_surface: "app" }),
      );
    });

    it("does not throw when posthog.capture throws", async () => {
      mockCapture.mockImplementationOnce(() => {
        throw new Error("capture error");
      });
      const { captureEvent } = await import("./analytics");
      expect(() => captureEvent("failing_event", { x: 1 })).not.toThrow();
    });

    it("forwards signup completion events to Bing UET for Microsoft Ads conversion goals", async () => {
      const { captureEvent, identifyUser } = await import("./analytics");
      identifyUser("user-1", {
        orgId: "org-1",
        member_role: "admin",
        plan_tier: "starter",
        subscription_status: "trialing",
      });

      captureEvent("signup_completed", {
        method: "email",
        plan_tier: "growth",
      });

      expect(mockTrackBingUetEvent).toHaveBeenCalledWith(
        "signup_completed",
        expect.objectContaining({
          method: "email",
          plan_tier: "growth",
          app_surface: "app",
          environment: "test",
        }),
      );
      expect(mockTrackBingUetEvent.mock.calls[0]?.[1]).not.toHaveProperty("org_id");
      expect(mockTrackBingUetEvent.mock.calls[0]?.[1]).not.toHaveProperty("member_role");
      expect(mockTrackBingUetEvent.mock.calls[0]?.[1]).not.toHaveProperty("subscription_status");
    });

    it("forwards conversion events with app context when properties are omitted", async () => {
      const { captureEvent } = await import("./analytics");

      captureEvent("trial_started");

      expect(mockTrackBingUetEvent).toHaveBeenCalledWith("trial_started", {
        app_surface: "app",
        environment: "test",
      });
    });

    it("falls back to production when the Vite mode is unavailable", async () => {
      vi.stubEnv("MODE", undefined);
      const { captureEvent } = await import("./analytics");

      captureEvent("lead_created");

      expect(mockTrackBingUetEvent).toHaveBeenCalledWith(
        "lead_created",
        expect.objectContaining({ environment: "production" }),
      );
    });

    it("does not forward non-conversion analytics events to Bing UET", async () => {
      const { captureEvent } = await import("./analytics");

      captureEvent("help_opened", { source: "nav" });

      expect(mockTrackBingUetEvent).not.toHaveBeenCalled();
    });

    it("captures first product milestones and completes activation after the required set", async () => {
      const { captureEvent, identifyUser } = await import("./analytics");
      identifyUser("user-1", {
        orgId: "org-1",
        member_role: "admin",
        plan_tier: "starter",
        subscription_status: "trialing",
      });
      mockCapture.mockClear();

      captureEvent("contact_created", { source: "manual" });
      captureEvent("contact_created", { source: "manual" });
      expect(
        mockCapture.mock.calls.filter(([event]) => event === "activation_completed"),
      ).toHaveLength(0);

      captureEvent("grant_created", { source: "manual" });
      expect(
        mockCapture.mock.calls.filter(([event]) => event === "activation_completed"),
      ).toHaveLength(0);

      captureEvent("fund_created", { source: "manual" });

      expect(mockCapture).toHaveBeenCalledWith(
        "contact_created",
        expect.objectContaining({ source: "manual", org_id: "org-1" }),
      );
      expect(mockCapture).toHaveBeenCalledWith(
        "first_contact_created",
        expect.objectContaining({
          source: "manual",
          trigger_event: "contact_created",
          org_id: "org-1",
        }),
      );
      expect(mockCapture).toHaveBeenCalledWith(
        "activation_completed",
        expect.objectContaining({
          activation_event: "fund_created",
          activation_milestone_count: 3,
          activation_required_milestones: ["contact_created", "grant_created", "fund_created"],
          source: "manual",
          org_id: "org-1",
        }),
      );
      expect(
        mockCapture.mock.calls.filter(([event]) => event === "first_contact_created"),
      ).toHaveLength(1);
      expect(
        mockCapture.mock.calls.filter(([event]) => event === "activation_completed"),
      ).toHaveLength(1);
    });

    it("captures first import completion separately from the raw import event", async () => {
      const { captureEvent, identifyUser } = await import("./analytics");
      identifyUser("user-1", { orgId: "org-2" });
      mockCapture.mockClear();

      captureEvent("import_completed", { entity_type: "contacts", row_count: 25 });

      expect(mockCapture).toHaveBeenCalledWith(
        "first_import_completed",
        expect.objectContaining({
          entity_type: "contacts",
          row_count: 25,
          trigger_event: "import_completed",
          org_id: "org-2",
        }),
      );
    });

    it("recovers when activation localStorage contains invalid JSON", async () => {
      window.localStorage.setItem("grantpipe_analytics_activation_state", "not-json");
      const { captureEvent, identifyUser } = await import("./analytics");
      identifyUser("user-1", { orgId: "org-invalid-json" });
      mockCapture.mockClear();

      captureEvent("contact_created");
      captureEvent("grant_created");
      captureEvent("fund_created");

      expect(mockCapture).toHaveBeenCalledWith(
        "activation_completed",
        expect.objectContaining({
          activation_event: "fund_created",
          activation_milestone_count: 3,
          org_id: "org-invalid-json",
        }),
      );
    });

    it("ignores activation localStorage that parses to a non-object value", async () => {
      window.localStorage.setItem("grantpipe_analytics_activation_state", "42");
      const { captureEvent, identifyUser } = await import("./analytics");
      identifyUser("user-1", { orgId: "org-non-object-state" });
      mockCapture.mockClear();

      captureEvent("contact_created");
      captureEvent("grant_created");
      captureEvent("fund_created");

      expect(mockCapture).toHaveBeenCalledWith(
        "activation_completed",
        expect.objectContaining({
          activation_event: "fund_created",
          activation_milestone_count: 3,
          org_id: "org-non-object-state",
        }),
      );
    });

    it("does not throw when activation localStorage writes fail", async () => {
      const setItemSpy = vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
        throw new Error("storage full");
      });
      const { captureEvent, identifyUser } = await import("./analytics");
      identifyUser("user-1", { orgId: "org-storage-fail" });
      mockCapture.mockClear();

      expect(() => captureEvent("grant_created")).not.toThrow();
      expect(mockCapture).toHaveBeenCalledWith(
        "first_grant_created",
        expect.objectContaining({
          trigger_event: "grant_created",
          org_id: "org-storage-fail",
        }),
      );
      expect(
        mockCapture.mock.calls.filter(([event]) => event === "activation_completed"),
      ).toHaveLength(0);

      setItemSpy.mockRestore();
    });
  });

  describe("captureRedirectEvent", () => {
    it("captures redirect-critical events with beacon transport and immediate send", async () => {
      const { captureRedirectEvent, identifyUser } = await import("./analytics");
      identifyUser("user-1", {
        orgId: "org-1",
        member_role: "admin",
        plan_tier: "starter",
        subscription_status: "trialing",
      });

      captureRedirectEvent("checkout_started", {
        plan_tier: "growth",
        billing_cycle: "annual",
      });

      expect(mockCapture).toHaveBeenCalledWith(
        "checkout_started",
        {
          org_id: "org-1",
          member_role: "admin",
          plan_tier: "growth",
          subscription_status: "trialing",
          billing_cycle: "annual",
          app_surface: "app",
          environment: "test",
        },
        { send_instantly: true, transport: "sendBeacon" },
      );
    });

    it("does not throw when redirect event capture throws", async () => {
      mockCapture.mockImplementationOnce(() => {
        throw new Error("capture error");
      });
      const { captureRedirectEvent } = await import("./analytics");
      expect(() => captureRedirectEvent("checkout_started")).not.toThrow();
    });
  });

  describe("initAnalytics error resilience", () => {
    it("does not throw when posthog.init throws", async () => {
      vi.stubEnv("VITE_POSTHOG_KEY", "phc_test_key");
      mockInit.mockImplementationOnce(() => {
        throw new Error("posthog init error");
      });
      const { initAnalytics } = await import("./analytics");
      expect(() => initAnalytics()).not.toThrow();
    });
  });

  describe("captureEvent activation storage resilience", () => {
    it("does not throw when localStorage.setItem throws during activation state write", async () => {
      vi.stubEnv("VITE_POSTHOG_KEY", "phc_test_key");
      const { captureEvent } = await import("./analytics");
      const setItemSpy = vi.spyOn(window.localStorage, "setItem").mockImplementationOnce(() => {
        throw new Error("storage full");
      });
      expect(() => captureEvent("contact.created")).not.toThrow();
      setItemSpy.mockRestore();
    });
  });
});
