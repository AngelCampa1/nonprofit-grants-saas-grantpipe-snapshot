import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { marketingKnowledge } from "@grantpipe/shared/public-kb";

const siteRoot = join(__dirname, "..");

function readSiteFile(relativePath: string): string {
  return readFileSync(join(siteRoot, relativePath), "utf8");
}

// Marketing-site visitors who land on grantpipe.com/signup (or /signup/) must be
// sent to the real attributed signup on the app subdomain. The site has no real
// signup of its own — signup lives on app.grantpipe.com.
//
// The redirect is issued at the worker boundary (the canonical-host patch in
// scripts/patch-site-canonical-host-redirect.ts) as a direct cross-host 301,
// mirroring the /grant/* legacy-alias pattern. It must NOT be a _redirects rule:
// a cross-host _redirects rule is honored inside env.ASSETS.fetch and loops
// forever (TypeError: Too many redirects -> Cloudflare 1101 -> HTTP 500). The
// behavioral 301 test lives in scripts/patch-site-canonical-host-redirect.test.ts;
// the assertions here guard against the looping _redirects rule regressing back
// in, and keep the belt-and-suspenders signup.astro fallback in place.
//
// The page's inline client-side location.replace is the fallback. Cloudflare
// forwards the incoming query string to the destination when the target has no
// query of its own, and the client replace re-appends search + hash, so UTM/click
// attribution is preserved either way.
describe("marketing-site signup redirect", () => {
  const redirects = readSiteFile("public/_redirects");
  const workerPatch = readFileSync(
    join(siteRoot, "..", "..", "scripts", "patch-site-canonical-host-redirect.ts"),
    "utf8",
  );
  const signupPage = readSiteFile("src/pages/signup.astro");
  const astroConfig = readSiteFile("astro.config.mjs");
  const canonicalSignup = `${marketingKnowledge.brand.appUrl}${marketingKnowledge.brand.signupPath}`;

  it("points the canonical app signup at the app subdomain root /signup", () => {
    expect(canonicalSignup).toBe("https://app.grantpipe.com/app/signup");
    expect(marketingKnowledge.brand.signupUrl).toBe(canonicalSignup);
  });

  it("redirects signup at the worker boundary, not via a cross-host _redirects rule", () => {
    expect(workerPatch).toContain("grantpipe-signup-redirect");
    expect(workerPatch).toContain('new URL("https://app.grantpipe.com/app/signup")');
  });

  it("never reintroduces the looping cross-host /signup _redirects rule", () => {
    // A cross-host /signup rule in _redirects loops inside env.ASSETS.fetch.
    expect(redirects).not.toContain("/signup https://app.grantpipe.com/app/signup");
    expect(redirects).not.toContain("/signup/ https://app.grantpipe.com/app/signup");
  });

  it("never redirects signup to a root app path that the router cannot match", () => {
    expect(redirects).not.toContain("https://app.grantpipe.com/signup");
    expect(workerPatch).not.toContain('new URL("https://app.grantpipe.com/signup")');
  });

  it("ships a real signup page so the route resolves instead of throwing on the catch-all", () => {
    expect(signupPage).toContain('buildSignupUrl } from "@/lib/app-url"');
    expect(signupPage).toContain("const targetUrl = buildSignupUrl()");
  });

  it("client-side replaces to the app signup while preserving query + hash attribution", () => {
    expect(signupPage).toContain("window.location.replace");
    expect(signupPage).toContain("window.location.search");
    expect(signupPage).toContain("window.location.hash");
  });

  it("keeps the signup page out of search indexes", () => {
    expect(signupPage).toContain('content="noindex, follow"');
  });

  it("excludes /signup/ from the sitemap as a noindex page", () => {
    expect(astroConfig).toContain('"/signup/"');
  });
});
