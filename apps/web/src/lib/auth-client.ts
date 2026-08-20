import { createAuthClient } from "better-auth/react";
import type { BetterAuthClientOptions } from "better-auth/client";

// Explicit type alias avoids TS2742 ("cannot be named without a reference to
// internal better-auth paths") that occurs with isolatedModules + declaration emit.
type Client = ReturnType<typeof createAuthClient<BetterAuthClientOptions>>;

export function createAuthClientConfig() {
  return {
    baseURL: window.location.origin,
    basePath: "/api/auth/better",
  };
}

export const authClient: Client = createAuthClient(createAuthClientConfig());

export const { signIn, signUp, signOut, useSession: useBetterAuthSession } = authClient;
