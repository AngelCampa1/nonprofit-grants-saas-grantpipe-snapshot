import { describe, it, expect, vi } from "vitest";
import { uploadObject, signDownloadToken, verifyDownloadToken } from "./r2";

// Minimal R2Bucket mock
function makeR2Bucket() {
  const store = new Map<string, { value: ArrayBuffer | Uint8Array; contentType: string }>();
  return {
    put: vi.fn(
      async (
        key: string,
        value: ArrayBuffer | Uint8Array,
        options?: { httpMetadata?: { contentType: string } },
      ) => {
        store.set(key, { value, contentType: options?.httpMetadata?.contentType ?? "" });
      },
    ),
    get: vi.fn(async (key: string) => {
      const entry = store.get(key);
      if (!entry) return null;
      return entry;
    }),
    store,
  };
}

describe("uploadObject", () => {
  it("calls bucket.put with the correct key, body, and contentType", async () => {
    const bucket = makeR2Bucket();
    const body = new Uint8Array([1, 2, 3]);
    await uploadObject(bucket as never, "my/key.pdf", body, "application/pdf");
    expect(bucket.put).toHaveBeenCalledWith("my/key.pdf", body, {
      httpMetadata: { contentType: "application/pdf" },
    });
  });

  it("works with ArrayBuffer body", async () => {
    const bucket = makeR2Bucket();
    const buf = new ArrayBuffer(4);
    await uploadObject(bucket as never, "key.bin", buf, "application/octet-stream");
    expect(bucket.put).toHaveBeenCalledWith("key.bin", buf, {
      httpMetadata: { contentType: "application/octet-stream" },
    });
  });

  it("resolves without throwing on success", async () => {
    const bucket = makeR2Bucket();
    await expect(
      uploadObject(bucket as never, "test.pdf", new Uint8Array(), "application/pdf"),
    ).resolves.toBeUndefined();
  });
});

describe("signDownloadToken", () => {
  it("round-trips leadId and magnetSlug correctly", async () => {
    const leadId = "lead-1";
    const magnetSlug = "my-magnet";
    const expiresAt = Date.now() + 3_600_000;
    const token = await signDownloadToken(leadId, magnetSlug, expiresAt, "secret");
    const result = await verifyDownloadToken(token, "secret");
    expect(result).toEqual({ leadId, magnetSlug });
  });

  it("embeds leadId, magnetSlug, and expiresAt in the first three segments", async () => {
    const expiresAt = 9999999999999;
    const token = await signDownloadToken("lead-abc", "my-slug", expiresAt, "s");
    const [leadId, magnetSlug, exp] = token.split(".");
    expect(leadId).toBe("lead-abc");
    expect(magnetSlug).toBe("my-slug");
    expect(exp).toBe(String(expiresAt));
  });

  it("produces a 64-char lowercase hex HMAC in the last segment", async () => {
    const token = await signDownloadToken("l", "m", 1000, "secret");
    const hex = token.split(".").at(-1);
    expect(hex).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for the same inputs", async () => {
    const a = await signDownloadToken("l", "m", 1000, "secret");
    const b = await signDownloadToken("l", "m", 1000, "secret");
    expect(a).toBe(b);
  });

  it("produces different tokens for different secrets", async () => {
    const a = await signDownloadToken("l", "m", 1000, "secretA");
    const b = await signDownloadToken("l", "m", 1000, "secretB");
    expect(a).not.toBe(b);
  });
});

describe("verifyDownloadToken", () => {
  it("returns leadId and magnetSlug for a valid non-expired token", async () => {
    const expiresAt = Date.now() + 3600_000;
    const token = await signDownloadToken("lead-1", "my-magnet", expiresAt, "secret");
    const result = await verifyDownloadToken(token, "secret");
    expect(result).toEqual({ leadId: "lead-1", magnetSlug: "my-magnet" });
  });

  it("returns null for an expired token", async () => {
    const expiresAt = Date.now() - 1000;
    const token = await signDownloadToken("lead-1", "my-magnet", expiresAt, "secret");
    const result = await verifyDownloadToken(token, "secret");
    expect(result).toBeNull();
  });

  it("returns null when HMAC is tampered", async () => {
    const expiresAt = Date.now() + 3600_000;
    const token = await signDownloadToken("lead-1", "my-magnet", expiresAt, "secret");
    const parts = token.split(".");
    parts[3] = parts[3]!.replace(/.$/, (c) => (c === "a" ? "b" : "a"));
    const tampered = parts.join(".");
    const result = await verifyDownloadToken(tampered, "secret");
    expect(result).toBeNull();
  });

  it("returns null when verified with wrong secret", async () => {
    const expiresAt = Date.now() + 3600_000;
    const token = await signDownloadToken("lead-1", "my-magnet", expiresAt, "secret");
    const result = await verifyDownloadToken(token, "wrong");
    expect(result).toBeNull();
  });

  it("returns null for tokens with fewer than 4 segments", async () => {
    expect(await verifyDownloadToken("a.b.c", "secret")).toBeNull();
    expect(await verifyDownloadToken("a.b", "secret")).toBeNull();
    expect(await verifyDownloadToken("nodots", "secret")).toBeNull();
  });

  it("returns null for tokens with non-numeric expiresAt", async () => {
    // Construct a token with NaN expiresAt field
    const token = "lead-1.slug.notanumber.deadbeef";
    expect(await verifyDownloadToken(token, "secret")).toBeNull();
  });

  it("returns null for an empty token", async () => {
    expect(await verifyDownloadToken("", "secret")).toBeNull();
  });

  it("returns null when magnetSlug segment is missing (firstDot <= 0 branch)", async () => {
    // Token that has 3 dots but the magnetSlug segment would be empty after split
    // e.g. "leadId..expiresAt.hex" — rest = ".expiresAt.hex", firstDot = 0
    expect(await verifyDownloadToken("leadId..expiresAt.hex", "secret")).toBeNull();
  });

  it("returns null when expiresAt is empty (lastDot at start of afterSlug)", async () => {
    // Token structured so afterSlug starts with a dot: "leadId.slug..hex"
    // afterSlug = ".hex", lastDot = 0 which triggers lastDot <= 0
    expect(await verifyDownloadToken("leadId.slug..hex", "secret")).toBeNull();
  });

  it("returns null when hex segment is empty (lastDot at end of afterSlug)", async () => {
    // afterSlug ends with a dot: "leadId.slug.123."
    // afterSlug = "123.", lastDot = 3 = afterSlug.length - 1
    expect(await verifyDownloadToken("leadId.slug.123.", "secret")).toBeNull();
  });
});
