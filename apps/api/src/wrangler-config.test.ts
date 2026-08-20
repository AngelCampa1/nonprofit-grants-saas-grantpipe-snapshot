import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const wranglerToml = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");

describe("wrangler production bindings", () => {
  it("binds Browser Rendering with the name used by PDF generation", () => {
    expect(wranglerToml).toMatch(
      /\[env\.production\.browser\]\s+binding\s*=\s*"BROWSER_RENDERING"/,
    );
  });
});
