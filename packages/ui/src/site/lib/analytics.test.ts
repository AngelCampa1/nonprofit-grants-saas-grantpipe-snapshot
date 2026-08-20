import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  POSTHOG_HOST,
  buildOsPositioningViewScript,
  buildPostHogBootstrapScript,
  resolvePostHogBootstrapConfig,
  trackEvent,
  identifyUser,
  type PostHogInstance,
} from "./analytics";

function makePostHogMock(overrides: Partial<PostHogInstance> = {}): PostHogInstance {
  return {
    capture: vi.fn(),
    identify: vi.fn(),
    ...overrides,
  };
}

describe("analytics constants", () => {
  it("POSTHOG_HOST is a non-empty string", () => {
    expect(typeof POSTHOG_HOST).toBe("string");
    expect(POSTHOG_HOST.length).toBeGreaterThan(0);
  });

  it("does not export a hardcoded POSTHOG_API_KEY constant", async () => {
    // The hardcoded key must no longer exist as a named export — callers must
    // supply an explicit key or receive null from resolvePostHogBootstrapConfig.
    const mod = (await import("./analytics")) as Record<string, unknown>;
    expect(mod["POSTHOG_API_KEY"]).toBeUndefined();
  });
});

describe("buildPostHogBootstrapScript", () => {
  it("returns empty string when no apiKey is provided (null)", () => {
    expect(buildPostHogBootstrapScript("GrantPipe", null)).toBe("");
  });

  it("returns empty string when apiKey is undefined", () => {
    expect(buildPostHogBootstrapScript("GrantPipe", undefined)).toBe("");
  });

  it("returns empty string when apiKey is blank whitespace", () => {
    expect(buildPostHogBootstrapScript("GrantPipe", "   ")).toBe("");
  });

  it("never embeds the hardcoded key in output when called without a key", () => {
    const HARDCODED_KEY = "phc_examplePostHogProjectKey0000000000000000";
    const result = buildPostHogBootstrapScript("GrantPipe", null);
    expect(result).not.toContain(HARDCODED_KEY);
  });

  it("enables automatic pageview and pageleave capture", () => {
    const script = buildPostHogBootstrapScript("RestrictedBooks", "phc_test_key");

    expect(script).toContain("capture_pageview: true");
    expect(script).toContain("capture_pageleave: true");
  });

  it("enables replay, autocapture, frustration signals, and privacy filtering", () => {
    const script = buildPostHogBootstrapScript("RestrictedBooks", "phc_test_key");
    const init = vi.fn();
    const register = vi.fn();

    new Function(
      "document",
      "window",
      `const posthog = window.posthog; ${script}; return window.posthog;`,
    )(
      {},
      {
        posthog: {
          __SV: 1,
          init,
          register,
        },
      },
    );

    const config = init.mock.calls[0]?.[1] as {
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
      mask_personal_data_properties: true,
    });
    expect(config.custom_personal_data_properties).toEqual(
      expect.arrayContaining(["email", "invite", "token", "password"]),
    );
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
        page_path: "/pricing",
      },
    });

    expect(sanitized?.properties).toMatchObject({
      email: "[redacted]",
      token: "[redacted]",
      invite: "[redacted]",
      password: "[redacted]",
      page_path: "/pricing",
    });
  });

  it("disables PostHog web vitals when Array.prototype.at is unavailable", () => {
    const script = buildPostHogBootstrapScript("GrantPipe", "phc_test_key");
    const init = vi.fn();
    const register = vi.fn();
    const originalArrayAt = Object.getOwnPropertyDescriptor(Array.prototype, "at");

    Object.defineProperty(Array.prototype, "at", {
      configurable: true,
      value: undefined,
      writable: true,
    });

    try {
      expect(() =>
        new Function(
          "document",
          "window",
          `const posthog = window.posthog; ${script}; return window.posthog;`,
        )(
          {},
          {
            posthog: {
              __SV: 1,
              init,
              register,
            },
          },
        ),
      ).not.toThrow();
    } finally {
      if (originalArrayAt) {
        Object.defineProperty(Array.prototype, "at", originalArrayAt);
      } else {
        delete Array.prototype.at;
      }
    }

    const config = init.mock.calls[0]?.[1] as {
      capture_performance?: { web_vitals?: unknown; network_timing?: unknown };
    };

    expect(config.capture_performance).toEqual({
      web_vitals: false,
      network_timing: false,
    });
  });

  it("redacts sensitive URLs in SDK-generated events before sending", () => {
    const script = buildPostHogBootstrapScript("RestrictedBooks", "phc_test_key");
    const init = vi.fn();
    const register = vi.fn();

    new Function(
      "document",
      "window",
      `const posthog = window.posthog; ${script}; return window.posthog;`,
    )(
      {},
      {
        posthog: {
          __SV: 1,
          init,
          register,
        },
      },
    );

    const config = init.mock.calls[0]?.[1] as {
      before_send?: (event: { event?: string; properties?: Record<string, unknown> }) => {
        event?: string;
        properties?: Record<string, unknown>;
      } | null;
    };

    const sanitized = config.before_send?.({
      event: "$autocapture",
      properties: {
        $current_url: "https://grantpipe.com/app/portal/raw-token-123?token=secret",
        $pathname: "/invite/raw-invite-token",
        $referrer: "https://grantpipe.com/login?invite=invite-token-123",
      },
    });

    expect(sanitized?.properties).toMatchObject({
      $current_url: "https://grantpipe.com/app/portal/[redacted]?token=%5Bredacted%5D",
      $pathname: "/invite/[redacted]",
      $referrer: "https://grantpipe.com/login?invite=%5Bredacted%5D",
    });
  });

  it("normalizes generic entity IDs in URL-like analytics properties", () => {
    const script = buildPostHogBootstrapScript("GrantPipe", "phc_test_key");
    const init = vi.fn();
    const register = vi.fn();

    new Function(
      "document",
      "window",
      `const posthog = window.posthog; ${script}; return window.posthog;`,
    )(
      {},
      {
        posthog: {
          __SV: 1,
          init,
          register,
        },
      },
    );

    const config = init.mock.calls[0]?.[1] as {
      before_send?: (event: { event?: string; properties?: Record<string, unknown> }) => {
        event?: string;
        properties?: Record<string, unknown>;
      } | null;
    };

    const sanitized = config.before_send?.({
      event: "$pageview",
      properties: {
        page_path: "/free/grants/550e8400-e29b-41d4-a716-446655440000",
        result_path: "/search/cmf4d9k8t0000kx08p7b2q1m9?id=507f1f77bcf86cd799439011",
        href: "https://grantpipe.com/downloads/file-123456789012345?document_id=doc_123456789012",
      },
    });

    expect(sanitized?.properties).toMatchObject({
      page_path: "/free/grants/[redacted-id]",
      result_path: "/search/[redacted-id]?id=%5Bredacted-id%5D",
      href: "https://grantpipe.com/downloads/[redacted-id]?document_id=%5Bredacted-id%5D",
    });
  });

  it("drops raw exception and console text before sending SDK-generated events", () => {
    const script = buildPostHogBootstrapScript("GrantPipe", "phc_test_key");
    const init = vi.fn();
    const register = vi.fn();

    new Function(
      "document",
      "window",
      `const posthog = window.posthog; ${script}; return window.posthog;`,
    )(
      {},
      {
        posthog: {
          __SV: 1,
          init,
          register,
        },
      },
    );

    const config = init.mock.calls[0]?.[1] as {
      before_send?: (event: { event?: string; properties?: Record<string, unknown> }) => {
        event?: string;
        properties?: Record<string, unknown>;
      } | null;
    };

    const sanitized = config.before_send?.({
      event: "$exception",
      properties: {
        $exception_message: "Jane Smith failed Alpha Grant signup",
        $exception_stack: "stack containing Jane Smith",
        console_args: ["Jane Smith", "Alpha Grant"],
      },
    });

    expect(sanitized?.properties).toMatchObject({
      $exception_message: "[redacted]",
      $exception_stack: "[redacted]",
      console_args: "[redacted]",
    });
  });

  it("redacts autocapture hrefs and nested element metadata before sending", () => {
    const script = buildPostHogBootstrapScript("RestrictedBooks", "phc_test_key");
    const init = vi.fn();
    const register = vi.fn();

    new Function(
      "document",
      "window",
      `const posthog = window.posthog; ${script}; return window.posthog;`,
    )(
      {},
      {
        posthog: {
          __SV: 1,
          init,
          register,
        },
      },
    );

    const config = init.mock.calls[0]?.[1] as {
      before_send?: (event: { event?: string; properties?: Record<string, unknown> }) => {
        event?: string;
        properties?: Record<string, unknown>;
      } | null;
    };

    const sanitized = config.before_send?.({
      event: "$autocapture",
      properties: {
        attr__href: "https://grantpipe.com/invite/raw-token-123?token=secret",
        $external_click_url: "https://grantpipe.com/portal/review?token=portal-token",
        $elements_chain: 'a.attr__href="https://grantpipe.com/invite/raw-token"',
        $elements: [
          {
            attr__href: "https://grantpipe.com/app/portal/raw-token-123?token=secret",
          },
        ],
      },
    });

    expect(sanitized?.properties).toMatchObject({
      attr__href: "https://grantpipe.com/invite/[redacted]?token=%5Bredacted%5D",
      $external_click_url: "https://grantpipe.com/portal/review?token=%5Bredacted%5D",
      $elements_chain: 'a.attr__href="https://grantpipe.com/invite/[redacted]"',
      $elements: [
        {
          attr__href: "https://grantpipe.com/app/portal/[redacted]?token=%5Bredacted%5D",
        },
      ],
    });
  });

  it("redacts sensitive exception and console strings before sending", () => {
    const script = buildPostHogBootstrapScript("RestrictedBooks", "phc_test_key");
    const init = vi.fn();
    const register = vi.fn();

    new Function(
      "document",
      "window",
      `const posthog = window.posthog; ${script}; return window.posthog;`,
    )(
      {},
      {
        posthog: {
          __SV: 1,
          init,
          register,
        },
      },
    );

    const config = init.mock.calls[0]?.[1] as {
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
          "Error at https://grantpipe.com/app/portal/raw-token-123?invite=invite-token",
        console_args: ["portal token", "https://grantpipe.com/portal/review?token=portal-token"],
      },
    });

    expect(sanitized?.properties).toMatchObject({
      $exception_message: "[redacted]",
      $exception_stack: "[redacted]",
      console_args: "[redacted]",
    });
  });

  it("registers the site tag with the provided site name", () => {
    const script = buildPostHogBootstrapScript("RestrictedBooks", "phc_test_key");

    expect(script).toContain('site: "RestrictedBooks"');
  });

  it("uses the provided API key and host values", () => {
    const script = buildPostHogBootstrapScript(
      "RestrictedBooks",
      "test-key",
      "https://example.i.posthog.com",
    );

    expect(script).toContain('posthog.init("test-key", {');
    expect(script).toContain('api_host: "https://example.i.posthog.com"');
  });

  it("does not throw when posthog.init throws during bootstrap", () => {
    const script = buildPostHogBootstrapScript("RestrictedBooks", "phc_test_key");
    const init = vi.fn(() => {
      throw new ReferenceError("options is not defined");
    });
    const register = vi.fn();

    expect(() =>
      new Function(
        "document",
        "window",
        `const posthog = window.posthog; ${script}; return window.posthog;`,
      )(
        {},
        {
          posthog: {
            __SV: 1,
            init,
            register,
          },
        },
      ),
    ).not.toThrow();

    expect(init).toHaveBeenCalledOnce();
    expect(register).toHaveBeenCalledOnce();
  });

  it("does not throw when posthog.register throws during bootstrap", () => {
    const script = buildPostHogBootstrapScript("RestrictedBooks", "phc_test_key");
    const register = vi.fn(() => {
      throw new ReferenceError("options is not defined");
    });
    const init = vi.fn();

    expect(() =>
      new Function(
        "document",
        "window",
        `const posthog = window.posthog; ${script}; return window.posthog;`,
      )(
        {},
        {
          posthog: {
            __SV: 1,
            init,
            register,
          },
        },
      ),
    ).not.toThrow();

    expect(init).toHaveBeenCalledOnce();
    expect(register).toHaveBeenCalledOnce();
    expect(register).toHaveBeenCalledWith({ site: "RestrictedBooks" });
  });
});

describe("resolvePostHogBootstrapConfig", () => {
  it("trims and returns the provided key and host", () => {
    expect(
      resolvePostHogBootstrapConfig("  test-key  ", "  https://example.i.posthog.com  "),
    ).toEqual({
      apiKey: "test-key",
      apiHost: "https://example.i.posthog.com",
    });
  });

  it("returns null apiKey when key is undefined", () => {
    expect(resolvePostHogBootstrapConfig(undefined, undefined)).toEqual({
      apiKey: null,
      apiHost: POSTHOG_HOST,
    });
  });

  it("returns null apiKey when key is empty or whitespace", () => {
    expect(resolvePostHogBootstrapConfig("", " ")).toEqual({
      apiKey: null,
      apiHost: POSTHOG_HOST,
    });
  });

  it("never returns the old hardcoded GrantPipe key as a default", () => {
    const HARDCODED_KEY = "phc_examplePostHogProjectKey0000000000000000";
    const result = resolvePostHogBootstrapConfig(undefined, undefined);
    expect(result.apiKey).not.toBe(HARDCODED_KEY);
  });
});

describe("buildOsPositioningViewScript", () => {
  it("captures the OS positioning view event with page context", () => {
    const script = buildOsPositioningViewScript("product", "/product/");

    expect(script).toContain("marketing.os_positioning_view");
    expect(script).toContain('page: "product"');
    expect(script).toContain('path: "/product/"');
  });

  it("does not throw when posthog capture fails", () => {
    const script = buildOsPositioningViewScript("guide", "/resources/guides/test/");
    const capture = vi.fn(() => {
      throw new ReferenceError("posthog unavailable");
    });

    expect(() =>
      new Function("window", script)({
        posthog: {
          capture,
        },
      }),
    ).not.toThrow();

    expect(capture).toHaveBeenCalledWith("marketing.os_positioning_view", {
      page: "guide",
      path: "/resources/guides/test/",
    });
  });
});

describe("trackEvent", () => {
  beforeEach(() => {
    delete window.posthog;
  });

  afterEach(() => {
    delete window.posthog;
  });

  it("calls window.posthog.capture with event name and properties when posthog exists", () => {
    const capture = vi.fn();
    window.posthog = makePostHogMock({ capture });

    trackEvent("signup_started", { source: "hero" });

    expect(capture).toHaveBeenCalledOnce();
    expect(capture).toHaveBeenCalledWith("signup_started", { source: "hero" });
  });

  it("does not throw when window.posthog is undefined", () => {
    expect(() => trackEvent("some_event", { key: "value" })).not.toThrow();
  });

  it("calls capture with no properties when properties arg is omitted", () => {
    const capture = vi.fn();
    window.posthog = makePostHogMock({ capture });

    trackEvent("page_viewed");

    expect(capture).toHaveBeenCalledOnce();
    expect(capture).toHaveBeenCalledWith("page_viewed", undefined);
  });

  it("does not throw when posthog.capture throws", () => {
    const capture = vi.fn(() => {
      throw new ReferenceError("options is not defined");
    });
    window.posthog = makePostHogMock({ capture });

    expect(() => trackEvent("section_viewed", { section: "hero" })).not.toThrow();
  });
});

describe("identifyUser", () => {
  beforeEach(() => {
    delete window.posthog;
  });

  afterEach(() => {
    delete window.posthog;
  });

  it("calls window.posthog.identify with distinctId and non-PII properties when posthog exists", () => {
    const identify = vi.fn();
    window.posthog = makePostHogMock({ identify });

    identifyUser("user-abc", {
      email: "test@example.com",
      name: "Test User",
      plan_tier: "growth",
    });

    expect(identify).toHaveBeenCalledOnce();
    expect(identify).toHaveBeenCalledWith("user-abc", {
      plan_tier: "growth",
    });
  });

  it("does not throw when window.posthog is undefined", () => {
    expect(() => identifyUser("user-abc", { email: "test@example.com" })).not.toThrow();
  });

  it("calls identify with no properties when properties arg is omitted", () => {
    const identify = vi.fn();
    window.posthog = makePostHogMock({ identify });

    identifyUser("user-1");

    expect(identify).toHaveBeenCalledOnce();
    expect(identify).toHaveBeenCalledWith("user-1", undefined);
  });

  it("does not throw when posthog.identify throws", () => {
    const identify = vi.fn(() => {
      throw new ReferenceError("options is not defined");
    });
    window.posthog = makePostHogMock({ identify });

    expect(() => identifyUser("user-1", { email: "test@example.com" })).not.toThrow();
  });
});
