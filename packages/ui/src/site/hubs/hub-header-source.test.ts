import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function readHubSource(fileName: string): string {
  return readFileSync(resolve(__dirname, fileName), "utf8");
}

describe("shared hub header source", () => {
  it.each(["content-hub.astro", "category-hub.astro"])(
    "%s passes currentPath so parent nav stays active on resource-owned hubs",
    (fileName) => {
      expect(readHubSource(fileName)).toContain("currentPath={Astro.url.pathname}");
    },
  );
});
