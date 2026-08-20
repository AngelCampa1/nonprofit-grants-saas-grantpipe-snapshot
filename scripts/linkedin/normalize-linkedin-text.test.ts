import { describe, expect, it } from "vitest";

import { normalizeLinkedInText } from "./build-schedule-manifest";

describe("normalizeLinkedInText", () => {
  it("turns single arrow markers into paragraph breaks", () => {
    expect(normalizeLinkedInText("First paragraph.↵ Next paragraph.")).toBe(
      "First paragraph.\n\nNext paragraph.",
    );
  });

  it("collapses repeated arrow markers into one paragraph break", () => {
    expect(normalizeLinkedInText("First paragraph.↵↵Next paragraph.")).toBe(
      "First paragraph.\n\nNext paragraph.",
    );
  });

  it("removes leading spaces from each paragraph", () => {
    expect(normalizeLinkedInText(" First paragraph.\n  Next paragraph.")).toBe(
      "First paragraph.\n\nNext paragraph.",
    );
  });

  it("keeps already spaced markdown unchanged", () => {
    const markdown = "# Title\n\nFirst paragraph.\n\nSecond paragraph.";

    expect(normalizeLinkedInText(markdown)).toBe(markdown);
  });
});
