import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { initBingUet, trackBingUetEvent } from "./bing-uet";

function clearAddedScripts(): void {
  document.head.querySelectorAll("script[src*='bat.bing.net']").forEach((node) => node.remove());
}

describe("initBingUet", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    delete (window as { uetq?: unknown }).uetq;
    delete (window as { UET?: unknown }).UET;
    clearAddedScripts();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    clearAddedScripts();
  });

  it("does nothing when not in production", () => {
    vi.stubEnv("PROD", false);
    initBingUet();
    expect(document.head.querySelector("script[src*='bat.bing.net']")).toBeNull();
  });

  it("appends the UET script with the default tag id when no env override is set", () => {
    vi.stubEnv("PROD", true);
    initBingUet();
    const script = document.head.querySelector(
      "script[src*='bat.bing.net']",
    ) as HTMLScriptElement | null;
    expect(script).not.toBeNull();
    expect(script?.src).toContain("ti=343248795");
    expect(script?.async).toBe(true);
  });

  it("uses VITE_BING_UET_ID when provided", () => {
    vi.stubEnv("PROD", true);
    vi.stubEnv("VITE_BING_UET_ID", "999999999");
    initBingUet();
    const script = document.head.querySelector(
      "script[src*='bat.bing.net']",
    ) as HTMLScriptElement | null;
    expect(script?.src).toContain("ti=999999999");
  });

  it("seeds window.uetq with an array queue before the script loads", () => {
    vi.stubEnv("PROD", true);
    initBingUet();
    expect(Array.isArray((window as { uetq?: unknown }).uetq)).toBe(true);
  });

  it("constructs UET and pushes pageLoad once the script loads", () => {
    vi.stubEnv("PROD", true);
    const pushSpy = vi.fn();
    const ctorSpy = vi.fn(() => ({ push: pushSpy }));
    (window as { UET?: unknown }).UET = ctorSpy as unknown;

    initBingUet();
    const script = document.head.querySelector(
      "script[src*='bat.bing.net']",
    ) as HTMLScriptElement | null;
    expect(script).not.toBeNull();
    script?.onload?.(new Event("load"));

    expect(ctorSpy).toHaveBeenCalledWith(
      expect.objectContaining({ ti: "343248795", enableAutoSpaTracking: true }),
    );
    expect(pushSpy).toHaveBeenCalledWith("pageLoad");
  });

  it("does not throw if window.UET is missing on script load", () => {
    vi.stubEnv("PROD", true);
    initBingUet();
    const script = document.head.querySelector(
      "script[src*='bat.bing.net']",
    ) as HTMLScriptElement | null;
    expect(() => script?.onload?.(new Event("load"))).not.toThrow();
  });

  it("swallows errors thrown by the UET constructor on script load", () => {
    vi.stubEnv("PROD", true);
    const ctorSpy = vi.fn(() => {
      throw new Error("blocked");
    });
    (window as { UET?: unknown }).UET = ctorSpy as unknown;

    initBingUet();
    const script = document.head.querySelector(
      "script[src*='bat.bing.net']",
    ) as HTMLScriptElement | null;
    expect(script).not.toBeNull();
    expect(() => script?.onload?.(new Event("load"))).not.toThrow();
    expect(ctorSpy).toHaveBeenCalled();
  });

  it("retries initialization when bat.js loads before window.UET is ready", () => {
    vi.useFakeTimers();
    vi.stubEnv("PROD", true);
    const pushSpy = vi.fn();
    const ctorSpy = vi.fn(() => ({ push: pushSpy }));

    initBingUet();
    const script = document.head.querySelector(
      "script[src*='bat.bing.net']",
    ) as HTMLScriptElement | null;
    expect(script).not.toBeNull();

    script?.onload?.(new Event("load"));
    expect(ctorSpy).not.toHaveBeenCalled();

    (window as { UET?: unknown }).UET = ctorSpy as unknown;
    vi.advanceTimersByTime(100);

    expect(ctorSpy).toHaveBeenCalledWith(
      expect.objectContaining({ ti: "343248795", enableAutoSpaTracking: true }),
    );
    expect(pushSpy).toHaveBeenCalledWith("pageLoad");
  });

  it("swallows errors thrown while injecting the script", () => {
    vi.stubEnv("PROD", true);
    const appendChildSpy = vi.spyOn(document.head, "appendChild").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => initBingUet()).not.toThrow();
    appendChildSpy.mockRestore();
  });

  it("falls back to the default tag id when VITE_BING_UET_ID is empty", () => {
    vi.stubEnv("PROD", true);
    vi.stubEnv("VITE_BING_UET_ID", "");
    initBingUet();
    const script = document.head.querySelector(
      "script[src*='bat.bing.net']",
    ) as HTMLScriptElement | null;
    expect(script?.src).toContain("ti=343248795");
  });

  it("pushes named custom conversion events to UET when the tag is ready", () => {
    const pushSpy = vi.fn();
    (window as { uetq?: unknown }).uetq = { push: pushSpy };

    trackBingUetEvent("signup_completed", {
      method: "email",
      plan_tier: "growth",
      has_invite: false,
      amount_cents: 5000,
    });

    expect(pushSpy).toHaveBeenCalledWith("event", "signup_completed", {
      event_category: "app",
      method: "email",
      plan_tier: "growth",
      has_invite: "false",
      amount_cents: 5000,
    });
  });

  it("pushes only the event category when custom properties are omitted", () => {
    const pushSpy = vi.fn();
    (window as { uetq?: unknown }).uetq = { push: pushSpy };

    trackBingUetEvent("trial_started");

    expect(pushSpy).toHaveBeenCalledWith("event", "trial_started", {
      event_category: "app",
    });
  });

  it("does nothing when the UET queue is unavailable or malformed", () => {
    expect(() => trackBingUetEvent("signup_completed")).not.toThrow();

    (window as { uetq?: unknown }).uetq = { push: "not-a-function" };

    expect(() => trackBingUetEvent("signup_completed")).not.toThrow();
  });

  it("does not throw when UET rejects a custom event", () => {
    (window as { uetq?: unknown }).uetq = {
      push: () => {
        throw new Error("blocked");
      },
    };

    expect(() => trackBingUetEvent("signup_completed")).not.toThrow();
  });

  it("omits user and organization identifiers from UET custom event properties", () => {
    const pushSpy = vi.fn();
    (window as { uetq?: unknown }).uetq = { push: pushSpy };

    trackBingUetEvent("signup_completed", {
      email: "person@example.com",
      name: "Person Example",
      org_id: "org-123",
      member_role: "admin",
      subscription_status: "trialing",
      method: "email",
      metadata: { source: "ad" },
      referrers: ["bing"],
    });

    expect(pushSpy).toHaveBeenCalledWith("event", "signup_completed", {
      event_category: "app",
      method: "email",
    });
  });

  it("omits contact, auth, and camelCase identifier variants from custom event properties", () => {
    const pushSpy = vi.fn();
    (window as { uetq?: unknown }).uetq = { push: pushSpy };

    trackBingUetEvent("lead_created", {
      authToken: "secret",
      billing_cycle: "annual",
      email_address: "person@example.com",
      fullName: "Person Example",
      organizationId: "org-123",
      phone: "555-0100",
      sessionId: "session-123",
      userId: "user-123",
    });

    expect(pushSpy).toHaveBeenCalledWith("event", "lead_created", {
      event_category: "app",
      billing_cycle: "annual",
    });
  });

  it("allows non-PII paid attribution on conversion events", () => {
    const pushSpy = vi.fn();
    (window as { uetq?: unknown }).uetq = { push: pushSpy };

    trackBingUetEvent("signup_completed", {
      landing_page: "/lp/grant-compliance-software/",
      utm_source: "bing",
      utm_medium: "cpc",
      utm_campaign: "BING_Search_Grant-Compliance_Trial_2026-05",
      utm_term: "grant compliance software",
      msclkid: "ms-click-1",
    });

    expect(pushSpy).toHaveBeenCalledWith("event", "signup_completed", {
      event_category: "app",
      landing_page: "/lp/grant-compliance-software/",
      utm_source: "bing",
      utm_medium: "cpc",
      utm_campaign: "BING_Search_Grant-Compliance_Trial_2026-05",
      utm_term: "grant compliance software",
      msclkid: "ms-click-1",
    });
  });
});
