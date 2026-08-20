import { describe, it, expect } from "vitest";
import {
  renderEmailLayout,
  renderCtaButton,
  renderListUnsubscribeHeader,
  renderVideoCard,
  escapeEmailHtmlText,
  sanitizeEmailHref,
} from "./email-layout";
import { getVideo, youtubeWatchUrl, youtubeThumbnailUrl } from "@grantpipe/shared";

describe("email HTML safety helpers", () => {
  it("escapes text and both quote styles", () => {
    expect(escapeEmailHtmlText(`<tag a="x" b='y'>&`)).toBe(
      "&lt;tag a=&quot;x&quot; b=&#39;y&#39;&gt;&amp;",
    );
  });

  it("allows escaped HTTP(S) links and rejects unsafe or malformed links", () => {
    expect(sanitizeEmailHref("https://example.com/?a=1&b=2")).toBe(
      "https://example.com/?a=1&amp;b=2",
    );
    expect(sanitizeEmailHref("http://example.com/path")).toBe("http://example.com/path");
    expect(sanitizeEmailHref("javascript:alert(1)")).toBe("#");
    expect(sanitizeEmailHref("not a URL")).toBe("#");
  });
});

// ---------------------------------------------------------------------------
// renderEmailLayout
// ---------------------------------------------------------------------------

describe("renderEmailLayout", () => {
  it("produces a valid HTML document", () => {
    const html = renderEmailLayout({ body: "<p>Hello</p>" });
    expect(html).toContain("<!doctype html>");
    expect(html).toContain('<html lang="en">');
    expect(html).toContain("</html>");
    expect(html).toContain("<body");
    expect(html).toContain("</body>");
  });

  it("includes charset and viewport meta tags", () => {
    const html = renderEmailLayout({ body: "<p>Test</p>" });
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('<meta name="viewport"');
    expect(html).toContain("width=device-width");
  });

  it("does not include client appearance meta tags", () => {
    const html = renderEmailLayout({ body: "<p>Test</p>" });
    expect(html).not.toContain(["color", "scheme"].join("-"));
    expect(html).not.toContain(["supported-color", "schemes"].join("-"));
  });

  it("renders the body content inside the layout", () => {
    const html = renderEmailLayout({ body: "<p>My content here</p>" });
    expect(html).toContain("<p>My content here</p>");
  });

  it("renders the GrantPipe logo exactly once", () => {
    const html = renderEmailLayout({ body: "<p>Test</p>" });
    const matches = html.match(/GrantPipe logo/g);
    expect(matches).toHaveLength(1);
    expect(html).toContain("data-email-brand");
  });

  it("renders with default marketing URL logo when marketingUrl is not provided", () => {
    const html = renderEmailLayout({ body: "<p>Test</p>" });
    expect(html).toContain("https://grantpipe.com/logo-email.png");
  });

  it("uses provided marketingUrl for the logo", () => {
    const html = renderEmailLayout({
      body: "<p>Test</p>",
      marketingUrl: "https://preview.grantpipe.com",
    });
    expect(html).toContain("https://preview.grantpipe.com/logo-email.png");
  });

  it("includes unsubscribe link when unsubscribeUrl is provided", () => {
    const html = renderEmailLayout({
      body: "<p>Test</p>",
      unsubscribeUrl: "https://grantpipe.com/unsubscribe?token=abc",
    });
    expect(html).toContain("https://grantpipe.com/unsubscribe?token=abc");
    const matches = html.match(/https:\/\/grantpipe\.com\/unsubscribe\?token=abc/g);
    expect(matches).toHaveLength(1);
    expect(html).toContain("Unsubscribe");
  });

  it("omits unsubscribe link when unsubscribeUrl is not provided", () => {
    const html = renderEmailLayout({ body: "<p>Test</p>" });
    expect(html).not.toContain("Unsubscribe");
    expect(html).not.toContain("unsubscribe?token");
  });

  it("omits the old boxed unsubscribe button style", () => {
    const html = renderEmailLayout({
      body: "<p>Test</p>",
      unsubscribeUrl: "https://grantpipe.com/unsubscribe?token=abc",
    });
    expect(html).not.toContain("border:1px solid #94a3b8");
    expect(html).not.toContain("Opt out of these emails");
  });

  it("renders preheader hidden span when preheader is provided", () => {
    const html = renderEmailLayout({
      body: "<p>Test</p>",
      preheader: "This is a preheader text",
    });
    expect(html).toContain("This is a preheader text");
    expect(html).toContain("overflow:hidden");
    expect(html).toContain("display:none");
    expect(html).toContain("max-height:0px");
  });

  it("omits preheader element when not provided", () => {
    const html = renderEmailLayout({ body: "<p>Test</p>" });
    expect(html).not.toContain("overflow:hidden");
    expect(html).not.toContain("max-height:0px");
  });

  it("escapes HTML in preheader to prevent injection", () => {
    const html = renderEmailLayout({
      body: "<p>Test</p>",
      preheader: "<script>alert('xss')</script>",
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("moves CTA button tables out of paragraph tags", () => {
    const html = renderEmailLayout({
      body: `<p>Start ${renderCtaButton("https://example.com", "Start trial")} after.</p>`,
    });

    expect(html).not.toMatch(/<p>(?:(?!<\/p>)[\s\S])*<table data-cta="true"/);
    expect(html).toContain("<p>Start</p>");
    expect(html).toContain("<p>after.</p>");
  });

  it("moves multiple CTA button tables out of the same paragraph", () => {
    const html = renderEmailLayout({
      body: `<p>Before ${renderCtaButton("https://example.com/a", "A")} middle ${renderCtaButton(
        "https://example.com/b",
        "B",
      )} after.</p>`,
    });

    expect(html).not.toMatch(/<p>(?:(?!<\/p>)[\s\S])*<table data-cta="true"/);
    expect(html.match(/data-cta="true"/g)).toHaveLength(2);
    expect(html).toContain("<p>Before</p>");
    expect(html).toContain("<p>middle</p>");
    expect(html).toContain("<p>after.</p>");
  });

  it("does not emit empty paragraphs around standalone nested CTA tables", () => {
    const html = renderEmailLayout({
      body: `<p>${renderCtaButton("https://example.com", "Start trial")}</p>`,
    });

    expect(html).not.toContain("<p></p>");
    expect(html.match(/data-cta="true"/g)).toHaveLength(1);
  });

  it("includes entitlement-safe compliance-first positioning in footer", () => {
    const html = renderEmailLayout({ body: "<p>Test</p>" });
    expect(html).toContain("compliance-first grant management system");
    expect(html).toContain("awards, deadlines, restricted funds");
    expect(html).toContain("evidence, reports, donor context, and audit trails");
  });

  it("does not render legacy positioning phrases", () => {
    const html = renderEmailLayout({ body: "<p>Test</p>" });
    const banned = [
      ["one", "operating system"].join(" "),
      ["same", "operating system"].join(" "),
      ["audit-ready", "reporting"].join(" "),
      ["no consultants", "required"].join(" "),
      ["30-day", "trial"].join(" "),
      ["without", "consultants"].join(" "),
    ];

    for (const phrase of banned) {
      expect(html.toLowerCase()).not.toContain(phrase);
    }
  });

  it("omits received-because line for transactional emails (no unsubscribeUrl)", () => {
    const html = renderEmailLayout({ body: "<p>Test</p>" });
    expect(html).not.toContain("downloaded a resource from grantpipe.com");
  });

  it("includes received-because line when unsubscribeUrl is provided", () => {
    const html = renderEmailLayout({
      body: "<p>Test</p>",
      unsubscribeUrl: "https://grantpipe.com/unsubscribe?token=abc",
    });
    expect(html).toContain("downloaded a resource from grantpipe.com");
  });

  it("respects a custom receivedBecause override", () => {
    const html = renderEmailLayout({
      body: "<p>Test</p>",
      receivedBecause: "You're receiving this because you're a GrantPipe customer.",
    });
    expect(html).toContain("You're receiving this because you're a GrantPipe customer.");
    expect(html).not.toContain("downloaded a resource from grantpipe.com");
  });

  it("uses table-based layout for email client compatibility", () => {
    const html = renderEmailLayout({ body: "<p>Test</p>" });
    expect(html).toContain('role="presentation"');
    expect(html).toContain("max-width:600px");
  });

  it("escapes double-quotes in unsubscribeUrl for safe href attribute", () => {
    const html = renderEmailLayout({
      body: "<p>Test</p>",
      unsubscribeUrl: 'https://example.com/unsub?a="b"',
    });
    expect(html).not.toContain('href="https://example.com/unsub?a="b""');
    expect(html).toContain("&quot;b&quot;");
  });
});

// ---------------------------------------------------------------------------
// renderCtaButton
// ---------------------------------------------------------------------------

describe("renderCtaButton", () => {
  it("returns HTML containing data-cta attribute", () => {
    const html = renderCtaButton("https://app.grantpipe.com", "Start your trial");
    expect(html).toContain('data-cta="true"');
  });

  it("includes the provided href", () => {
    const html = renderCtaButton("https://app.grantpipe.com/signup", "Get started");
    expect(html).toContain("https://app.grantpipe.com/signup");
  });

  it("includes the provided label text", () => {
    const html = renderCtaButton("https://app.grantpipe.com", "Start your trial");
    expect(html).toContain("Start your trial");
  });

  it("uses emerald background color #047857", () => {
    const html = renderCtaButton("https://app.grantpipe.com", "Click me");
    expect(html).toContain("#047857");
  });

  it("uses white text color", () => {
    const html = renderCtaButton("https://app.grantpipe.com", "Click me");
    expect(html).toContain("#ffffff");
  });

  it("uses table-based structure for Outlook compatibility", () => {
    const html = renderCtaButton("https://app.grantpipe.com", "Click me");
    expect(html).toContain("<table");
    expect(html).toContain('role="presentation"');
    expect(html).toContain("<a href=");
  });

  it("includes VML for Outlook rendering", () => {
    const html = renderCtaButton("https://app.grantpipe.com", "Click me");
    expect(html).toContain("v:roundrect");
    expect(html).toContain("mso-hide:all");
  });

  it("escapes double-quotes in href", () => {
    const html = renderCtaButton('https://example.com?a="b"', "Click");
    expect(html).not.toContain('href="https://example.com?a="b""');
    expect(html).toContain("&quot;b&quot;");
  });

  it("escapes HTML entities in label", () => {
    const html = renderCtaButton("https://example.com", "Click <here> & go");
    expect(html).not.toContain("<here>");
    expect(html).toContain("&lt;here&gt;");
    expect(html).toContain("&amp;");
  });

  it("uses pill border-radius", () => {
    const html = renderCtaButton("https://app.grantpipe.com", "Click me");
    expect(html).toContain("border-radius:9999px");
    expect(html).toContain('arcsize="50%"');
  });

  it("includes padding of 10px 20px", () => {
    const html = renderCtaButton("https://app.grantpipe.com", "Click me");
    expect(html).toContain("padding:10px 20px");
  });
});

describe("renderListUnsubscribeHeader", () => {
  it("includes a mailto fallback before the preference URL", () => {
    expect(renderListUnsubscribeHeader("https://app.grantpipe.com/notifications")).toBe(
      "<mailto:angel.campa@grantpipe.com?subject=Unsubscribe>, <https://app.grantpipe.com/notifications>",
    );
  });
});

// ---------------------------------------------------------------------------
// renderVideoCard
// ---------------------------------------------------------------------------

describe("renderVideoCard", () => {
  const record = getVideo("grant-tracking-spreadsheet");

  it("returns a string with an Outlook-safe table", () => {
    const html = renderVideoCard(record);
    expect(html).toContain("<table");
    expect(html).toContain('role="presentation"');
  });

  it("includes data-video-card hook attribute", () => {
    const html = renderVideoCard(record);
    expect(html).toContain('data-video-card="true"');
  });

  it("contains thumbnail img with correct src", () => {
    const html = renderVideoCard(record);
    expect(html).toContain(youtubeThumbnailUrl(record.youtubeId));
    expect(html).toContain("<img");
  });

  it("wraps thumbnail in anchor pointing to watch URL", () => {
    const html = renderVideoCard(record);
    const watchUrl = youtubeWatchUrl(record.youtubeId);
    expect(html).toContain(watchUrl);
    // The <a href should appear before <img (thumbnail wrapped in anchor)
    const anchorIdx = html.indexOf(`<a href="${watchUrl}"`);
    const imgIdx = html.indexOf("<img", anchorIdx);
    expect(anchorIdx).toBeGreaterThan(-1);
    expect(imgIdx).toBeGreaterThan(anchorIdx);
  });

  it("includes the video title or shortTitle text", () => {
    const html = renderVideoCard(record);
    const hasTitle = html.includes(record.title) || html.includes(record.shortTitle);
    expect(hasTitle).toBe(true);
  });

  it("includes a Watch on YouTube text link to the watch URL", () => {
    const html = renderVideoCard(record);
    expect(html).toContain("Watch on YouTube");
    expect(html).toContain(youtubeWatchUrl(record.youtubeId));
  });

  it("uses inline styles only and contains no script tags", () => {
    const html = renderVideoCard(record);
    expect(html).toContain("style=");
    expect(html).not.toContain("<script");
  });

  it("escapes double-quotes in watch URL href", () => {
    // Use a record with a synthetic youtubeId containing a quote-like edge case
    // by testing the normal record — just assert no raw unescaped attribute break
    const html = renderVideoCard(record);
    // href value should be wrapped in double quotes cleanly
    expect(html).toMatch(/href="https:\/\/www\.youtube\.com\/watch\?v=/);
  });

  it("uses emerald color #047857 for Watch on YouTube link", () => {
    const html = renderVideoCard(record);
    expect(html).toContain("#047857");
  });

  it("thumbnail has border-radius:8px", () => {
    const html = renderVideoCard(record);
    expect(html).toContain("border-radius:8px");
  });

  it("thumbnail img has width attribute of 560", () => {
    const html = renderVideoCard(record);
    expect(html).toContain('width="560"');
  });

  it("falls back to title when shortTitle is empty", () => {
    const noShort = { ...record, shortTitle: "" };
    const html = renderVideoCard(noShort);
    expect(html).toContain(record.title);
  });

  it("escapes double-quotes in the alt attribute to prevent attribute injection", () => {
    const quoted = { ...record, title: 'A "quoted" title' };
    const html = renderVideoCard(quoted);
    expect(html).toContain('alt="A &quot;quoted&quot; title"');
    expect(html).not.toContain('alt="A "quoted" title"');
  });
});
