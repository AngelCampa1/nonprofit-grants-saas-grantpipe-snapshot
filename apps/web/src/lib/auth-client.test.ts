import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreateAuthClient } = vi.hoisted(() => ({
  mockCreateAuthClient: vi.fn(() => ({
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    useSession: vi.fn(),
  })),
}));

vi.mock("better-auth/react", () => ({
  createAuthClient: mockCreateAuthClient,
}));

describe("auth-client", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    mockCreateAuthClient.mockClear();
  });

  it("creates the Better Auth client with the current origin and API base path", async () => {
    vi.stubGlobal("window", {
      location: {
        origin: "https://grantpipe.test",
      },
    });

    const { authClient, createAuthClientConfig, signIn, signOut, signUp, useBetterAuthSession } =
      await import("./auth-client");

    expect(createAuthClientConfig()).toEqual({
      baseURL: "https://grantpipe.test",
      basePath: "/api/auth/better",
    });

    expect(mockCreateAuthClient).toHaveBeenCalledWith({
      baseURL: "https://grantpipe.test",
      basePath: "/api/auth/better",
    });
    expect(authClient.signIn).toBe(signIn);
    expect(authClient.signUp).toBe(signUp);
    expect(authClient.signOut).toBe(signOut);
    expect(authClient.useSession).toBe(useBetterAuthSession);
  });
});
