import { describe, expect, it, vi, beforeEach } from "vitest";
import { trackEvent } from "./analytics";
import { trackLeadMagnetDeliverySuppressed } from "./lead-magnet-analytics";

vi.mock("./analytics", () => ({ trackEvent: vi.fn() }));

describe("trackLeadMagnetDeliverySuppressed", () => {
  beforeEach(() => {
    vi.mocked(trackEvent).mockClear();
  });

  it("tracks suppressed delivery with the shared lead magnet payload", () => {
    trackLeadMagnetDeliverySuppressed({
      source: "lead_magnet_inline",
      sourcePage: "/resources/guides/test",
      magnetSlug: "grant-compliance-checklist",
    });

    expect(trackEvent).toHaveBeenCalledWith("lead_magnet_delivery_suppressed", {
      source: "lead_magnet_inline",
      source_page: "/resources/guides/test",
      magnet_slug: "grant-compliance-checklist",
      delivery_context: "initial_submit",
    });
  });

  it("omits magnet_slug when no magnet is attached to the flow", () => {
    trackLeadMagnetDeliverySuppressed({
      source: "exit_popup",
      sourcePage: "/pricing",
    });

    expect(trackEvent).toHaveBeenCalledWith("lead_magnet_delivery_suppressed", {
      source: "exit_popup",
      source_page: "/pricing",
      delivery_context: "initial_submit",
    });
  });
});
