import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { loadRootDotEnv, parseDotEnv } from "./local-env";

describe("parseDotEnv", () => {
  it("parses simple, quoted, and commented env lines", () => {
    expect(
      parseDotEnv(`
        # comment
        SENTRY_AUTH_TOKEN=token
        SENTRY_ORG="grantpipe"
        SENTRY_PROJECT_WEB='grantpipe-web'
        EMPTY=
        MALFORMED
      `),
    ).toEqual({
      SENTRY_AUTH_TOKEN: "token",
      SENTRY_ORG: "grantpipe",
      SENTRY_PROJECT_WEB: "grantpipe-web",
      EMPTY: "",
    });
  });
});

describe("loadRootDotEnv", () => {
  it("loads root .env values without overriding existing env values", () => {
    const root = mkdtempSync(join(tmpdir(), "grantpipe-env-"));
    const env = { SENTRY_ORG: "existing-org" };

    writeFileSync(
      join(root, ".env"),
      ["SENTRY_AUTH_TOKEN=token", "SENTRY_ORG=from-file"].join("\n"),
    );

    try {
      expect(loadRootDotEnv({ rootDir: root, env })).toEqual({
        SENTRY_AUTH_TOKEN: "token",
      });
      expect(env).toEqual({
        SENTRY_AUTH_TOKEN: "token",
        SENTRY_ORG: "existing-org",
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
