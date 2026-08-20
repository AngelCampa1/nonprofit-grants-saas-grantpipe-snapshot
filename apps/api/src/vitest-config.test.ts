import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

describe("vitest module aliases", () => {
  it("resolves the Sentry Cloudflare package through an installed path", () => {
    const configSource = readFileSync(new URL("../vitest.config.ts", import.meta.url), "utf8");
    const aliasMatch = configSource.match(/const SENTRY_CF = "([^"]+)"/);

    expect(aliasMatch?.[1]).toBe("node_modules/@sentry/cloudflare");

    const aliasPath = path.resolve(
      fileURLToPath(new URL("..", import.meta.url)),
      aliasMatch?.[1] ?? "",
    );

    expect(existsSync(aliasPath)).toBe(true);
  });
});
