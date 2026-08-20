import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function readWorkspaceFile(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("authenticated app technical SEO hardening", () => {
  it("marks every deployed app response noindex at the header layer", () => {
    const headers = readWorkspaceFile("public/_headers");

    expect(headers).toContain("X-Robots-Tag: noindex, nofollow, noarchive");
  });

  it("allows Bing UET conversion tracking through the app CSP", () => {
    const headers = readWorkspaceFile("public/_headers");

    expect(headers).toContain("https://bat.bing.net");
    expect(headers).toContain("https://bat.bing.com");
  });

  it("marks the SPA shell noindex for crawlers that render HTML", () => {
    const html = readWorkspaceFile("index.html");

    expect(html).toContain('<meta name="robots" content="noindex, nofollow, noarchive" />');
  });

  it("blocks crawler discovery of authenticated app routes with robots.txt", () => {
    const robots = readWorkspaceFile("public/robots.txt");

    expect(robots).toContain("User-agent: *");
    expect(robots).toContain("Disallow: /");
  });
});
