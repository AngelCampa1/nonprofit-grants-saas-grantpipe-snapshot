import type { FullConfig } from "@playwright/test";

import { assertLiveE2ERunProof } from "./lib/live-e2e-proof";

function metadataUrl(config: FullConfig, key: string): string | undefined {
  const value = config.metadata?.[key];
  return typeof value === "string" ? value : undefined;
}

export default async function globalSetup(config: FullConfig): Promise<void> {
  const appUrl = metadataUrl(config, "appUrl") ?? "https://app.grantpipe.com";
  if (new URL(appUrl).hostname !== "app.grantpipe.com") return;

  assertLiveE2ERunProof(process.env);
}
