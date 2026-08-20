import { describe, expect, it } from "vitest";
import { getDocumentMimeFamily, getDocumentSizeBucket } from "./document-analytics";

describe("document analytics helpers", () => {
  it.each([
    [0, "under_10kb"],
    [10 * 1024 - 1, "under_10kb"],
    [10 * 1024, "10kb_100kb"],
    [100 * 1024, "100kb_1mb"],
    [1024 * 1024, "1mb_10mb"],
    [10 * 1024 * 1024, "over_10mb"],
  ])("maps %s bytes to %s", (sizeBytes, expectedBucket) => {
    expect(getDocumentSizeBucket(sizeBytes)).toBe(expectedBucket);
  });

  it.each([
    ["application/pdf", "application"],
    [" IMAGE/PNG ", "image"],
    ["", "unknown"],
    ["file-without-family", "unknown"],
  ])("maps MIME type %s to family %s", (mimeType, expectedFamily) => {
    expect(getDocumentMimeFamily(mimeType)).toBe(expectedFamily);
  });
});
