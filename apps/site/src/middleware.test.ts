import { describe, expect, it, vi } from "vitest";

vi.mock("astro:middleware", () => ({
  defineMiddleware: <T>(handler: T) => handler,
}));

import { onRequest, resolveSiteMiddlewareRedirect } from "./middleware";

describe("resolveSiteMiddlewareRedirect", () => {
  it("redirects www traffic before legacy path normalization", () => {
    expect(
      resolveSiteMiddlewareRedirect(
        new URL("https://www.grantpipe.com/glossary/grant-funded-nonprofit-operating-system/"),
      )?.toString(),
    ).toBe("https://grantpipe.com/glossary/grant-funded-nonprofit-operating-system/");
  });

  it("redirects retired positioning slugs on the canonical host", () => {
    expect(
      resolveSiteMiddlewareRedirect(
        new URL("https://grantpipe.com/resources/guides/grant-funded-nonprofit-operating-system/"),
      )?.toString(),
    ).toBe("https://grantpipe.com/resources/guides/grant-management-software-for-nonprofits/");
  });

  it("does not redirect canonical pages", () => {
    expect(
      resolveSiteMiddlewareRedirect(
        new URL("https://grantpipe.com/resources/guides/grant-management-software-for-nonprofits/"),
      ),
    ).toBeNull();
  });

  it("returns a 301 response for legacy positioning slugs", async () => {
    const next = vi.fn(async () => new Response("next"));

    const response = await onRequest(
      {
        request: new Request(
          "https://grantpipe.com/glossary/grant-funded-nonprofit-operating-system/",
        ),
      } as Parameters<typeof onRequest>[0],
      next as Parameters<typeof onRequest>[1],
    );

    expect(response).toBeInstanceOf(Response);
    if (!(response instanceof Response)) {
      throw new Error("Expected middleware to return a redirect response");
    }
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe(
      "https://grantpipe.com/glossary/grant-compliance/",
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("continues to the next handler when no redirect applies", async () => {
    const passThroughResponse = new Response("next");
    const next = vi.fn(async () => passThroughResponse);

    const response = await onRequest(
      {
        request: new Request("https://grantpipe.com/pricing/"),
      } as Parameters<typeof onRequest>[0],
      next as Parameters<typeof onRequest>[1],
    );

    expect(response).toBe(passThroughResponse);
    expect(next).toHaveBeenCalledOnce();
  });
});
