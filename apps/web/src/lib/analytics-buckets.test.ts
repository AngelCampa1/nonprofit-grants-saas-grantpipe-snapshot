import { describe, expect, it } from "vitest";

import { getCountBucket, getTextLengthBucket } from "./analytics-buckets";

describe("analytics buckets", () => {
  it("buckets text lengths without exposing exact query length", () => {
    expect(getTextLengthBucket(0)).toBe("0");
    expect(getTextLengthBucket(20)).toBe("1-20");
    expect(getTextLengthBucket(50)).toBe("21-50");
    expect(getTextLengthBucket(51)).toBe("51+");
  });

  it("buckets counts without exposing exact result totals", () => {
    expect(getCountBucket(0)).toBe("0");
    expect(getCountBucket(10)).toBe("1-10");
    expect(getCountBucket(50)).toBe("11-50");
    expect(getCountBucket(51)).toBe("50+");
  });
});
