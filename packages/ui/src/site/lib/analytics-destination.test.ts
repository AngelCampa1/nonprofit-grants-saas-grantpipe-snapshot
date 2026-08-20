import { describe, expect, it } from "vitest";
import { destinationPathFromHref } from "./analytics-destination";

describe("destinationPathFromHref", () => {
  it("keeps only the pathname for relative URLs", () => {
    expect(destinationPathFromHref("/signup?token=secret#trial")).toBe("/signup");
  });

  it("keeps only the pathname for absolute HTTP URLs", () => {
    expect(destinationPathFromHref("https://app.grantpipe.com/signup?token=secret")).toBe(
      "/signup",
    );
  });

  it("buckets non-HTTP URLs without exposing addresses", () => {
    expect(destinationPathFromHref("mailto:angel@example.com")).toBe("non_http");
  });

  it("buckets malformed URLs", () => {
    expect(destinationPathFromHref("http://[bad")).toBe("invalid");
  });

  it("falls back to the GrantPipe origin when no origin is available", () => {
    expect(destinationPathFromHref("/pricing?token=secret", "")).toBe("/pricing");
  });
});
