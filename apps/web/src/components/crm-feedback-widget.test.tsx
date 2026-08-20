import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Vitest's vi.stubEnv patches import.meta.env correctly across the module
// boundary; vi.unstubAllEnvs() restores the original values after each test.
// ---------------------------------------------------------------------------

vi.mock("../lib/analytics", () => ({
  captureEvent: vi.fn(),
}));

import { captureEvent } from "../lib/analytics";
import { CrmFeedbackWidget } from "./crm-feedback-widget";

const mockCaptureEvent = vi.mocked(captureEvent);

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  document.querySelectorAll("script[data-widget='feedback-button']").forEach((s) => s.remove());
});

describe("CrmFeedbackWidget", () => {
  it("injects a script tag with the correct loader src, data-product, and data-widget when key is set", () => {
    vi.stubEnv("VITE_CRM_WIDGET_KEY", "wk_LOCALTESTPLACEHOLDER00000000000000");
    vi.stubEnv("VITE_CRM_LOADER_URL", "");

    render(<CrmFeedbackWidget />);

    const script = document.querySelector(
      "script[data-product='wk_LOCALTESTPLACEHOLDER00000000000000'][data-widget='feedback-button']",
    ) as HTMLScriptElement | null;

    expect(script).not.toBeNull();
    // Use getAttribute for src — happy-dom resolves .src relative to baseURL
    expect(script!.getAttribute("src")).toBe("https://crm.ventoralabs.com/w/v1.js");
    expect(script!.getAttribute("data-product")).toBe("wk_LOCALTESTPLACEHOLDER00000000000000");
    expect(script!.getAttribute("data-widget")).toBe("feedback-button");
    expect(mockCaptureEvent).toHaveBeenCalledWith("feedback_widget_loader_injected", {
      loader_origin: "crm.ventoralabs.com",
    });
  });

  it("injects nothing when the key env var is unset", () => {
    // Do not stub VITE_CRM_WIDGET_KEY — leave it undefined
    render(<CrmFeedbackWidget />);

    const script = document.querySelector("script[data-widget='feedback-button']");
    expect(script).toBeNull();
    expect(mockCaptureEvent).toHaveBeenCalledWith("feedback_widget_unavailable", {
      reason: "missing_key",
    });
  });

  it("injects nothing when the key env var is an empty string", () => {
    vi.stubEnv("VITE_CRM_WIDGET_KEY", "");
    render(<CrmFeedbackWidget />);

    const script = document.querySelector("script[data-widget='feedback-button']");
    expect(script).toBeNull();
    expect(mockCaptureEvent).toHaveBeenCalledWith("feedback_widget_unavailable", {
      reason: "missing_key",
    });
  });

  it("uses a custom loader URL when VITE_CRM_LOADER_URL is set", () => {
    vi.stubEnv("VITE_CRM_WIDGET_KEY", "wk_LOCALTESTPLACEHOLDER00000000000000");
    vi.stubEnv("VITE_CRM_LOADER_URL", "http://localhost:8787/w/v1.js");

    render(<CrmFeedbackWidget />);

    const script = document.querySelector(
      "script[data-product='wk_LOCALTESTPLACEHOLDER00000000000000'][data-widget='feedback-button']",
    ) as HTMLScriptElement | null;

    expect(script).not.toBeNull();
    expect(script!.getAttribute("src")).toBe("http://localhost:8787/w/v1.js");
    expect(mockCaptureEvent).toHaveBeenCalledWith("feedback_widget_loader_injected", {
      loader_origin: "localhost",
    });
  });

  it("falls back to an unknown loader origin when the loader URL is invalid", () => {
    vi.stubEnv("VITE_CRM_WIDGET_KEY", "wk_LOCALTESTPLACEHOLDER00000000000000");
    vi.stubEnv("VITE_CRM_LOADER_URL", "http://[");

    render(<CrmFeedbackWidget />);

    expect(mockCaptureEvent).toHaveBeenCalledWith("feedback_widget_loader_injected", {
      loader_origin: "unknown",
    });
  });

  it("does not inject a duplicate script when rendered twice", () => {
    vi.stubEnv("VITE_CRM_WIDGET_KEY", "wk_LOCALTESTPLACEHOLDER00000000000000");
    vi.stubEnv("VITE_CRM_LOADER_URL", "");

    render(<CrmFeedbackWidget />);
    render(<CrmFeedbackWidget />);

    const scripts = document.querySelectorAll(
      "script[data-product='wk_LOCALTESTPLACEHOLDER00000000000000'][data-widget='feedback-button']",
    );
    // Idempotent guard: only one script should be injected
    expect(scripts.length).toBe(1);
    expect(mockCaptureEvent).toHaveBeenCalledWith("feedback_widget_loader_skipped", {
      reason: "already_injected",
    });
  });

  it("removes the injected script on unmount", () => {
    vi.stubEnv("VITE_CRM_WIDGET_KEY", "wk_LOCALTESTPLACEHOLDER00000000000000");
    vi.stubEnv("VITE_CRM_LOADER_URL", "");

    const { unmount } = render(<CrmFeedbackWidget />);

    expect(document.querySelector("script[data-widget='feedback-button']")).not.toBeNull();

    unmount();

    expect(document.querySelector("script[data-widget='feedback-button']")).toBeNull();
    expect(mockCaptureEvent).toHaveBeenCalledWith("feedback_widget_loader_removed", {
      loader_origin: "crm.ventoralabs.com",
    });
  });

  it("tracks loader ready and loader failure events without exposing the widget key", () => {
    vi.stubEnv("VITE_CRM_WIDGET_KEY", "wk_LOCALTESTPLACEHOLDER00000000000000");
    vi.stubEnv("VITE_CRM_LOADER_URL", "");

    render(<CrmFeedbackWidget />);

    const script = document.querySelector(
      "script[data-product='wk_LOCALTESTPLACEHOLDER00000000000000'][data-widget='feedback-button']",
    ) as HTMLScriptElement | null;
    expect(script).not.toBeNull();

    script!.dispatchEvent(new Event("load"));
    script!.dispatchEvent(new Event("error"));

    expect(mockCaptureEvent).toHaveBeenCalledWith("feedback_widget_loader_ready", {
      loader_origin: "crm.ventoralabs.com",
    });
    expect(mockCaptureEvent).toHaveBeenCalledWith("feedback_widget_loader_failed", {
      loader_origin: "crm.ventoralabs.com",
    });
    expect(mockCaptureEvent).not.toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        widget_key: "wk_LOCALTESTPLACEHOLDER00000000000000",
      }),
    );
  });
});
