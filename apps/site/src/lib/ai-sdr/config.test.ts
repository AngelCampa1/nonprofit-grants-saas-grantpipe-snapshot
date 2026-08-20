import { describe, expect, it } from "vitest";

import { ALLOWED_ORIGINS, isAllowedOrigin, PRODUCT_ID, WORKER_BASE_URL } from "./config.js";

describe("ai-sdr config", () => {
  it("exposes the worker base url and product id", () => {
    expect(WORKER_BASE_URL).toBe("https://ventora-ai-sdr-worker.example-account.workers.dev");
    expect(PRODUCT_ID).toBe("grantpipe");
  });

  it("lists the production origins on the explicit allowlist", () => {
    expect(ALLOWED_ORIGINS).toContain("https://grantpipe.com");
    expect(ALLOWED_ORIGINS).toContain("https://www.grantpipe.com");
  });

  describe("isAllowedOrigin", () => {
    it("accepts the production origins", () => {
      expect(isAllowedOrigin("https://grantpipe.com")).toBe(true);
      expect(isAllowedOrigin("https://www.grantpipe.com")).toBe(true);
    });

    it("accepts localhost dev origins on any port", () => {
      expect(isAllowedOrigin("http://localhost:4321")).toBe(true);
      expect(isAllowedOrigin("http://localhost:3000")).toBe(true);
      expect(isAllowedOrigin("http://127.0.0.1:4321")).toBe(true);
    });

    it("accepts Cloudflare Pages preview origins for this project", () => {
      expect(isAllowedOrigin("https://abc123.grantpipe-site.pages.dev")).toBe(true);
      expect(isAllowedOrigin("https://my-branch.grantpipe-site.pages.dev")).toBe(true);
    });

    it("rejects the bare pages.dev apex and unrelated projects", () => {
      expect(isAllowedOrigin("https://grantpipe-site.pages.dev")).toBe(false);
      expect(isAllowedOrigin("https://abc123.other-site.pages.dev")).toBe(false);
    });

    it("rejects look-alike and hostile origins", () => {
      expect(isAllowedOrigin("https://evil.com")).toBe(false);
      expect(isAllowedOrigin("https://grantpipe.com.evil.com")).toBe(false);
      expect(isAllowedOrigin("https://notgrantpipe.com")).toBe(false);
      expect(isAllowedOrigin("https://abc.grantpipe-site.pages.dev.evil.com")).toBe(false);
      expect(isAllowedOrigin("")).toBe(false);
      expect(isAllowedOrigin("not-a-url")).toBe(false);
    });

    it("rejects http for non-localhost hosts", () => {
      expect(isAllowedOrigin("http://abc123.grantpipe-site.pages.dev")).toBe(false);
    });

    it("rejects https for localhost (dev origins are http-only)", () => {
      expect(isAllowedOrigin("https://localhost:4321")).toBe(false);
      expect(isAllowedOrigin("https://127.0.0.1:4321")).toBe(false);
    });
  });
});
