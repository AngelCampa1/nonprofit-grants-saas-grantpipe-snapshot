import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { assertCleanupWrappedLiveE2E } from "../e2e/helpers/auth";
import { createLiveE2ERunProof } from "./lib/live-e2e-proof";

describe("live E2E signup guard", () => {
  it("refuses to create throwaway E2E accounts on production outside the cleanup wrapper", () => {
    expect(() =>
      assertCleanupWrappedLiveE2E({
        targetUrl: "https://app.grantpipe.com/app/signup",
        env: {},
      }),
    ).toThrow("production E2E must run through cleanup");
  });

  it("requires a cleanup proof token for wrapped production signup checks", () => {
    expect(() =>
      assertCleanupWrappedLiveE2E({
        targetUrl: "https://app.grantpipe.com/app/signup",
        env: { GRANTPIPE_LIVE_E2E_WRAPPER: "1" },
      }),
    ).toThrow("production E2E requires a cleanup wrapper run token");
  });

  it("rejects a forged wrapper marker without cleanup proof", () => {
    expect(() =>
      assertCleanupWrappedLiveE2E({
        targetUrl: "https://app.grantpipe.com/app/signup",
        env: {
          GRANTPIPE_LIVE_E2E_WRAPPER: "1",
        },
      }),
    ).toThrow("production E2E requires a cleanup wrapper run token");
  });

  it("allows production signup checks when cleanup proof is present", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "grantpipe-live-e2e-"));
    try {
      const proof = createLiveE2ERunProof({ rootDir });

      expect(() =>
        assertCleanupWrappedLiveE2E({
          targetUrl: "https://app.grantpipe.com/app/signup",
          env: {
            GRANTPIPE_LIVE_E2E_WRAPPER: "1",
            GRANTPIPE_LIVE_E2E_RUN_TOKEN: proof.token,
            GRANTPIPE_LIVE_E2E_RUN_TOKEN_FILE: proof.filePath,
          },
        }),
      ).not.toThrow();
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("allows production signup checks when cleanup proof and optional analytics cleanup env are active", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "grantpipe-live-e2e-"));
    try {
      const proof = createLiveE2ERunProof({ rootDir });

      expect(() =>
        assertCleanupWrappedLiveE2E({
          targetUrl: "https://app.grantpipe.com/app/signup",
          env: {
            GRANTPIPE_LIVE_E2E_WRAPPER: "1",
            GRANTPIPE_LIVE_E2E_RUN_TOKEN: proof.token,
            GRANTPIPE_LIVE_E2E_RUN_TOKEN_FILE: proof.filePath,
            POSTHOG_PERSONAL_API_KEY: "phx_secret",
            POSTHOG_PROJECT_ID: "390138",
          },
        }),
      ).not.toThrow();
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("rejects mismatched cleanup proof", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "grantpipe-live-e2e-"));
    try {
      const proof = createLiveE2ERunProof({ rootDir });

      expect(() =>
        assertCleanupWrappedLiveE2E({
          targetUrl: "https://app.grantpipe.com/app/signup",
          env: {
            GRANTPIPE_LIVE_E2E_WRAPPER: "1",
            GRANTPIPE_LIVE_E2E_RUN_TOKEN: "forged",
            GRANTPIPE_LIVE_E2E_RUN_TOKEN_FILE: proof.filePath,
            POSTHOG_PERSONAL_API_KEY: "phx_secret",
            POSTHOG_PROJECT_ID: "390138",
          },
        }),
      ).toThrow("production E2E cleanup wrapper run token does not match");
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("allows local signup checks without the cleanup wrapper", () => {
    expect(() =>
      assertCleanupWrappedLiveE2E({
        targetUrl: "http://localhost:3050/app/signup",
        env: {},
      }),
    ).not.toThrow();
  });
});
