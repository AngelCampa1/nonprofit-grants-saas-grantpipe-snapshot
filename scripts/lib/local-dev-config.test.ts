import { afterEach, describe, expect, it, vi } from "vitest";

describe("local dev config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("returns the default GrantPipe local ports and origins", async () => {
    const config = await import("./local-dev-config");

    expect(config.getLocalWebPort()).toBe(5173);
    expect(config.getLocalApiPort()).toBe(8787);
    expect(config.getLocalWebOrigin()).toBe("http://localhost:5173");
    expect(config.getLocalApiOrigin()).toBe("http://localhost:8787");
  });

  it("allows overriding the local ports through environment variables", async () => {
    vi.stubEnv("GRANTPIPE_WEB_PORT", "5174");
    vi.stubEnv("GRANTPIPE_API_PORT", "8790");

    const config = await import("./local-dev-config");

    expect(config.getLocalWebPort()).toBe(5174);
    expect(config.getLocalApiPort()).toBe(8790);
    expect(config.getLocalWebOrigin()).toBe("http://localhost:5174");
    expect(config.getLocalApiOrigin()).toBe("http://localhost:8790");
  });

  it("falls back to defaults when the override is invalid", async () => {
    vi.stubEnv("GRANTPIPE_WEB_PORT", "abc");
    vi.stubEnv("GRANTPIPE_API_PORT", "0");

    const config = await import("./local-dev-config");

    expect(config.getLocalWebPort()).toBe(5173);
    expect(config.getLocalApiPort()).toBe(8787);
  });
});
