import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";

const { mockHc } = vi.hoisted(() => ({
  mockHc: vi.fn(() => ({ api: { test: true } })),
}));

vi.mock("hono/client", () => ({
  hc: mockHc,
}));

type ApiClientOptions = {
  headers?: Record<string, string> | (() => Record<string, string>);
  init: RequestInit;
};

function resolveHeaders(options: ApiClientOptions): Record<string, string> | undefined {
  return typeof options.headers === "function" ? options.headers() : options.headers;
}

describe("api-client", () => {
  beforeEach(() => {
    localStorage.clear();
    mockHc.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates the Hono RPC client at the application root", async () => {
    vi.resetModules();
    const { api } = await import("./api-client");

    expect(mockHc).toHaveBeenCalledWith(
      "/",
      expect.objectContaining({ init: expect.objectContaining({ credentials: "include" }) }),
    );
    expect(api).toEqual({ api: { test: true } });
  });

  it("passes credentials: include so session cookies are sent on cross-origin requests", async () => {
    vi.resetModules();
    await import("./api-client");

    const [, options] = mockHc.mock.calls[0] as unknown as [string, { init: RequestInit }];
    expect(options.init.credentials).toBe("include");
  });

  it("includes X-Org-Id header when localStorage has grantpipe.activeOrgId", async () => {
    localStorage.setItem("grantpipe.activeOrgId", "org-42");

    vi.resetModules();
    const { createApiClient } = await import("./api-client");
    createApiClient();

    const lastCall = mockHc.mock.calls[mockHc.mock.calls.length - 1] as unknown as [
      string,
      ApiClientOptions,
    ];
    // headers are at the top level so the hc client merges them before setting Content-Type
    expect(resolveHeaders(lastCall[1])).toEqual({ "X-Org-Id": "org-42" });
    expect((lastCall[1].init as Record<string, unknown>)["headers"]).toBeUndefined();
  });

  it("includes X-Entity-Id header when localStorage has grantpipe.activeEntityId", async () => {
    localStorage.setItem("grantpipe.activeOrgId", "org-42");
    localStorage.setItem("grantpipe.activeEntityId", "entity-42");

    vi.resetModules();
    const { createApiClient } = await import("./api-client");
    createApiClient();

    const lastCall = mockHc.mock.calls[mockHc.mock.calls.length - 1] as unknown as [
      string,
      ApiClientOptions,
    ];
    expect(resolveHeaders(lastCall[1])).toEqual({
      "X-Org-Id": "org-42",
      "X-Entity-Id": "entity-42",
    });
    expect((lastCall[1].init as Record<string, unknown>)["headers"]).toBeUndefined();
  });

  it("reads the active org header at request time", async () => {
    localStorage.setItem("grantpipe.activeOrgId", "org-before");

    vi.resetModules();
    const { createApiClient } = await import("./api-client");
    createApiClient();

    localStorage.setItem("grantpipe.activeOrgId", "org-after");
    localStorage.setItem("grantpipe.activeEntityId", "entity-after");
    const lastCall = mockHc.mock.calls[mockHc.mock.calls.length - 1] as unknown as [
      string,
      ApiClientOptions,
    ];

    expect(resolveHeaders(lastCall[1])).toEqual({
      "X-Org-Id": "org-after",
      "X-Entity-Id": "entity-after",
    });
  });

  it("does not include X-Org-Id header when localStorage has no active org", async () => {
    // localStorage is cleared in beforeEach
    vi.resetModules();
    const { createApiClient } = await import("./api-client");
    createApiClient();

    const lastCall = mockHc.mock.calls[mockHc.mock.calls.length - 1] as unknown as [
      string,
      ApiClientOptions,
    ];
    expect(resolveHeaders(lastCall[1])).toEqual({});
    expect((lastCall[1].init as Record<string, unknown>)["headers"]).toBeUndefined();
  });

  it("creates a client without an org header when window is unavailable", async () => {
    vi.stubGlobal("window", undefined);
    vi.resetModules();

    const { createApiClient } = await import("./api-client");
    createApiClient();

    const lastCall = mockHc.mock.calls[mockHc.mock.calls.length - 1] as unknown as [
      string,
      ApiClientOptions,
    ];
    expect(resolveHeaders(lastCall[1])).toEqual({});
    expect(lastCall[1].init.credentials).toBe("include");

    vi.unstubAllGlobals();
  });
});
