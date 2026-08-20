import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { securityHeaders } from "./security-headers";

describe("securityHeaders", () => {
  it("adds nosniff, crawler, referrer, permissions, and frame headers", async () => {
    const app = new Hono();
    app.use("*", securityHeaders());
    app.get("/test", (c) => c.json({ ok: true }));

    const res = await app.request("/test");

    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex, nofollow, noarchive");
    expect(res.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(res.headers.get("Permissions-Policy")).toBe("camera=(), microphone=(), geolocation=()");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
  });

  it("adds HSTS header on HTTPS requests", async () => {
    const app = new Hono();
    app.use("*", securityHeaders());
    app.get("/test", (c) => c.json({ ok: true }));

    const res = await app.request("https://api.grantpipe.com/test");

    expect(res.headers.get("Strict-Transport-Security")).toBe(
      "max-age=63072000; includeSubDomains; preload",
    );
  });

  it("does not add HSTS header on HTTP requests", async () => {
    const app = new Hono();
    app.use("*", securityHeaders());
    app.get("/test", (c) => c.json({ ok: true }));

    const res = await app.request("http://localhost:5050/test");

    expect(res.headers.get("Strict-Transport-Security")).toBeNull();
  });

  it("adds Content-Security-Policy header", async () => {
    const app = new Hono();
    app.use("*", securityHeaders());
    app.get("/test", (c) => c.json({ ok: true }));

    const res = await app.request("/test");

    expect(res.headers.get("Content-Security-Policy")).toBe(
      "default-src 'none'; frame-ancestors 'none'",
    );
  });
});
