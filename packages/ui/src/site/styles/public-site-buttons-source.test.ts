import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "./globals.css"), "utf8");

describe("public site button source contracts", () => {
  it("keeps the shared button tier system on the full-pill radius scale", () => {
    // The .btn-* tier system intentionally converges with the .gp-mkt-btn pill
    // vocabulary. Radius is driven by the --primary/secondary-button-radius
    // tokens (site-overridable) plus a literal full radius on .btn-ghost.
    expect(source).toContain(
      "--primary-button-radius: var(--site-primary-button-radius, var(--radius-full));",
    );
    expect(source).toContain(
      "--secondary-button-radius: var(--site-secondary-button-radius, var(--radius-full));",
    );
    expect(source).toContain("border-radius: var(--secondary-button-radius);");
    expect(source).toContain("border-radius: var(--radius-full);");
  });
});
