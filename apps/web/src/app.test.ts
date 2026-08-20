import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("app.css Tailwind sources", () => {
  it("includes the shared UI package as a Tailwind source", () => {
    const stylesheet = readFileSync(resolve(__dirname, "./app.css"), "utf8");

    expect(stylesheet).toContain('@source "../../../packages/ui/src";');
  });
});
