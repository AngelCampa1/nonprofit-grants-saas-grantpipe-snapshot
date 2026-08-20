import { describe, expect, it } from "vitest";

import { buildEmailLogoUrl, renderEmailBrandHeader } from "./email-brand";

describe("email brand helpers", () => {
  it("defaults the email logo to the production marketing site", () => {
    expect(buildEmailLogoUrl()).toBe("https://grantpipe.com/logo-email.png");
  });

  it("builds the email logo URL from MARKETING_URL", () => {
    expect(buildEmailLogoUrl("https://preview.grantpipe.com")).toBe(
      "https://preview.grantpipe.com/logo-email.png",
    );
  });

  it("falls back safely when MARKETING_URL is malformed", () => {
    expect(buildEmailLogoUrl("not-a-valid-url")).toBe("https://grantpipe.com/logo-email.png");
  });

  it("renders the branded HTML header with the configured logo URL", () => {
    const html = renderEmailBrandHeader("http://localhost:4321");

    expect(html).toContain("data-email-brand");
    expect(html).toContain('alt="GrantPipe logo"');
    expect(html).toContain("http://localhost:4321/logo-email.png");
    expect(html).toContain('width="200"');
    expect(html).toContain("max-width:200px");
    expect(html).toContain("height:auto");
    expect(html).not.toContain('height="40"');
    expect(html).not.toContain("height:40px");
  });

  it("wraps logo in a table for email client compatibility", () => {
    const html = renderEmailBrandHeader();
    expect(html).toContain('role="presentation"');
    expect(html).toContain("padding:16px 0");
  });
});
