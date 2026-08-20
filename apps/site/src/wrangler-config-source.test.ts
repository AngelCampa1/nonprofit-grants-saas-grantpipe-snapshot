import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readConfig(): string {
  return readFileSync(resolve("wrangler.jsonc"), "utf8");
}

function parseJsonc(source: string): Record<string, unknown> {
  const withoutComments = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  const withoutTrailingCommas = withoutComments.replace(/,\s*([}\]])/g, "$1");
  return JSON.parse(withoutTrailingCommas) as Record<string, unknown>;
}

describe("site Wrangler config", () => {
  it("runs the Worker before static assets so canonical host redirects execute", () => {
    const config = readConfig();

    expect(config).toContain('"assets"');
    expect(config).toContain('"run_worker_first": true');
  });

  it("uses Worker custom domains for both apex and www hosts", () => {
    const config = readConfig();

    expect(config).toContain('"pattern": "grantpipe.com"');
    expect(config).toContain('"pattern": "www.grantpipe.com"');
    expect(config).toContain('"custom_domain": true');
    expect(config).not.toContain('"grantpipe.com/*"');
    expect(config).not.toContain('"zone_name"');
  });

  it("uses production-safe top-level vars for generated production deploy config", () => {
    const config = parseJsonc(readConfig());
    const vars = config.vars as Record<string, string>;

    expect(vars.PUBLIC_SENTRY_ENVIRONMENT).toBe("production");
  });
});
