import { describe, expect, it, vi } from "vitest";
import { getVideoByLeadMagnet, youtubeWatchUrl } from "@grantpipe/shared";
import { makeDeliveryStep, magnetTitle } from "./nurture-copy";

describe("delivery copy", () => {
  it("renders the immediate lead-magnet delivery email", () => {
    const step = makeDeliveryStep("Grant Compliance Checklist");
    const html = step.html(
      "https://app.grantpipe.com",
      "https://grantpipe.com/unsub",
      "https://dl",
    );

    expect(step.subject).toBe("Your Grant Compliance Checklist from GrantPipe");
    expect(html).toContain("Download your Grant Compliance Checklist");
    expect(html.match(/data-cta="true"/g)).toHaveLength(1);
    expect(
      step.text("https://app.grantpipe.com", "https://grantpipe.com/unsub", "https://dl"),
    ).toContain("https://dl");
  });

  it.each(["https://app.grantpipe.com", "http://localhost:5173/"])(
    "uses the configured canonical signup URL in HTML and text for %s",
    (appUrl) => {
      const step = makeDeliveryStep("Grant Compliance Checklist");
      const html = step.html(appUrl, "https://grantpipe.com/unsub", "https://dl");
      const text = step.text(appUrl, "https://grantpipe.com/unsub", "https://dl");
      const origin = appUrl.replace(/\/+$/, "");

      expect(html).toContain(`${origin}/app/signup`);
      expect(text).toContain(`Start your trial -> ${origin}/app/signup`);
      expect(text).not.toContain("http://app.grantpipe.com");
    },
  );

  it("keeps only the first CTA table if generated copy includes duplicate CTA markup", async () => {
    vi.resetModules();
    vi.doMock("../../lib/email-layout", async (importOriginal) => {
      const actual = await importOriginal<typeof import("../../lib/email-layout")>();
      return {
        ...actual,
        renderCtaButton: () =>
          `${actual.renderCtaButton("https://app.grantpipe.com/a", "A")}
${actual.renderCtaButton("https://app.grantpipe.com/b", "B")}`,
      };
    });

    const imported = await import("./nurture-copy");
    const html = imported
      .makeDeliveryStep("Grant Compliance Checklist")
      .html("https://app.grantpipe.com", "https://grantpipe.com/unsub", "https://dl");

    expect(html.match(/data-cta="true"/g)).toHaveLength(1);
    expect(html).toContain("https://app.grantpipe.com/a");
    expect(html).not.toContain("https://app.grantpipe.com/b");
    vi.doUnmock("../../lib/email-layout");
  });

  it("maps known magnet slugs to titles and falls back to resource", () => {
    expect(magnetTitle("grant-compliance-checklist")).toBe("Grant Compliance Checklist");
    expect(magnetTitle("unknown")).toBe("resource");
    expect(magnetTitle(null)).toBe("resource");
  });

  it("includes the video card in HTML and watch URL in text when slug maps to a video", () => {
    const video = getVideoByLeadMagnet("grant-tracking-template");
    expect(video).toBeDefined();
    const watchUrl = youtubeWatchUrl(video!.youtubeId);

    const step = makeDeliveryStep("Grant Tracking Template", "grant-tracking-template");
    const html = step.html(
      "https://app.grantpipe.com",
      "https://grantpipe.com/unsub",
      "https://dl",
    );
    const text = step.text(
      "https://app.grantpipe.com",
      "https://grantpipe.com/unsub",
      "https://dl",
    );

    expect(html).toContain(watchUrl);
    expect(html).toContain('data-video-card="true"');
    expect(text).toContain(watchUrl);
  });

  it("does NOT include video card when slug has no mapped video", () => {
    const step = makeDeliveryStep("Grant Compliance Checklist", "grant-compliance-checklist");
    const html = step.html(
      "https://app.grantpipe.com",
      "https://grantpipe.com/unsub",
      "https://dl",
    );
    const text = step.text(
      "https://app.grantpipe.com",
      "https://grantpipe.com/unsub",
      "https://dl",
    );

    expect(html).not.toContain('data-video-card="true"');
    expect(text).not.toContain("Watch:");
  });

  it("is backward compatible — no slug omitted means no video card", () => {
    const step = makeDeliveryStep("Grant Compliance Checklist");
    const html = step.html(
      "https://app.grantpipe.com",
      "https://grantpipe.com/unsub",
      "https://dl",
    );

    expect(html).not.toContain('data-video-card="true"');
  });
});
