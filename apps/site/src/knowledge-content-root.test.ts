import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  MARKETING_CONTENT_COLLECTIONS,
  getMarketingContentCollectionBase,
} from "@grantpipe/shared/public-kb";
import { describe, expect, it } from "vitest";

describe("site marketing knowledge content root", () => {
  it("uses the shared knowledge content tree instead of local content sources", () => {
    const localContentRoot = fileURLToPath(new URL("./content", import.meta.url));

    expect(existsSync(localContentRoot)).toBe(false);

    for (const collection of MARKETING_CONTENT_COLLECTIONS) {
      expect(getMarketingContentCollectionBase(collection)).toBe(
        `../../packages/shared/src/knowledge/marketing/content/${collection}`,
      );
    }
  });
});
