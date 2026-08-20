import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildInvitePath, buildInviteRoutePath, buildInviteUrl } from "./invite-links";

describe("invite-links", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds app invite paths and URLs from a token", () => {
    expect(buildInvitePath("invite-token-1")).toBe("/app/invite/invite-token-1");
    expect(buildInviteRoutePath("invite-token-1")).toBe("/invite/invite-token-1");
    expect(buildInviteUrl("invite-token-1", "http://localhost:3000")).toBe(
      "http://localhost:3000/app/invite/invite-token-1",
    );
  });

  it("encodes invite tokens before adding them to the path", () => {
    expect(buildInvitePath("token with spaces")).toBe("/app/invite/token%20with%20spaces");
    expect(buildInviteRoutePath("token with spaces")).toBe("/invite/token%20with%20spaces");
  });

  it("uses the browser origin when no origin is provided", () => {
    window.history.pushState(null, "", "/settings");

    expect(buildInviteUrl("invite-token-1")).toBe(
      `${window.location.origin}/app/invite/invite-token-1`,
    );
  });

  it("builds a relative invite URL when no window exists", () => {
    vi.stubGlobal("window", undefined);

    expect(buildInviteUrl("invite-token-1")).toBe("/app/invite/invite-token-1");
  });

  it("returns null for empty invite tokens", () => {
    expect(buildInvitePath("   ")).toBeNull();
    expect(buildInviteRoutePath("   ")).toBeNull();
    expect(buildInviteUrl(null, "http://localhost:3000")).toBeNull();
  });
});
