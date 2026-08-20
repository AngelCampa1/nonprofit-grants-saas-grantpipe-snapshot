import { describe, it, expect } from "vitest";
import {
  hmacSha256Hex,
  timingSafeEqualHex,
  signUnsubscribeToken,
  verifyUnsubscribeToken,
} from "./hmac";

describe("hmacSha256Hex", () => {
  it("produces a 64-char lowercase hex string", async () => {
    const hex = await hmacSha256Hex("secret", "message");
    expect(hex).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for the same inputs", async () => {
    const a = await hmacSha256Hex("key", "data");
    const b = await hmacSha256Hex("key", "data");
    expect(a).toBe(b);
  });

  it("produces different output for different secrets", async () => {
    const a = await hmacSha256Hex("secret1", "data");
    const b = await hmacSha256Hex("secret2", "data");
    expect(a).not.toBe(b);
  });

  it("produces different output for different messages", async () => {
    const a = await hmacSha256Hex("key", "msg1");
    const b = await hmacSha256Hex("key", "msg2");
    expect(a).not.toBe(b);
  });

  it("throws when the secret is empty", async () => {
    await expect(hmacSha256Hex("", "message")).rejects.toThrow(/secret/i);
  });

  it("throws when the secret is undefined at runtime", async () => {
    // The Workers runtime can supply an undefined env binding even though the
    // TypeScript type says `string`. An empty/undefined key would yield a
    // known, forgeable HMAC, so signing/verifying must fail closed instead.
    await expect(hmacSha256Hex(undefined as unknown as string, "message")).rejects.toThrow(
      /secret/i,
    );
  });
});

describe("timingSafeEqualHex", () => {
  it("returns true for equal strings", () => {
    expect(timingSafeEqualHex("abcdef", "abcdef")).toBe(true);
  });

  it("returns false for strings of different lengths", () => {
    expect(timingSafeEqualHex("abc", "abcd")).toBe(false);
  });

  it("returns false for strings with one different character", () => {
    expect(timingSafeEqualHex("abcdef", "abcdeg")).toBe(false);
  });

  it("returns true for empty strings", () => {
    expect(timingSafeEqualHex("", "")).toBe(true);
  });
});

describe("signUnsubscribeToken", () => {
  it("returns a token of the form leadId.hex", async () => {
    const token = await signUnsubscribeToken("lead-123", "secret");
    expect(token).toMatch(/^lead-123\.[0-9a-f]{64}$/);
  });

  it("produces consistent tokens for the same inputs", async () => {
    const a = await signUnsubscribeToken("lead-abc", "mysecret");
    const b = await signUnsubscribeToken("lead-abc", "mysecret");
    expect(a).toBe(b);
  });

  it("produces different tokens for different lead IDs", async () => {
    const a = await signUnsubscribeToken("lead-1", "secret");
    const b = await signUnsubscribeToken("lead-2", "secret");
    expect(a).not.toBe(b);
  });

  it("handles leadIds containing dots", async () => {
    const token = await signUnsubscribeToken("lead.with.dots", "secret");
    expect(token).toMatch(/^lead\.with\.dots\.[0-9a-f]{64}$/);
  });
});

describe("verifyUnsubscribeToken", () => {
  it("returns the leadId for a valid token", async () => {
    const token = await signUnsubscribeToken("lead-123", "secret");
    const leadId = await verifyUnsubscribeToken(token, "secret");
    expect(leadId).toBe("lead-123");
  });

  it("returns null for an empty string", async () => {
    expect(await verifyUnsubscribeToken("", "secret")).toBeNull();
  });

  it("returns null when there is no dot", async () => {
    expect(await verifyUnsubscribeToken("nodothere", "secret")).toBeNull();
  });

  it("returns null when the dot is the first char", async () => {
    expect(await verifyUnsubscribeToken(".hex", "secret")).toBeNull();
  });

  it("returns null when the dot is the last char", async () => {
    expect(await verifyUnsubscribeToken("leadId.", "secret")).toBeNull();
  });

  it("returns null for a tampered hex", async () => {
    const token = await signUnsubscribeToken("lead-123", "secret");
    const tampered = token.slice(0, -1) + (token.endsWith("a") ? "b" : "a");
    expect(await verifyUnsubscribeToken(tampered, "secret")).toBeNull();
  });

  it("returns null when verified with wrong secret", async () => {
    const token = await signUnsubscribeToken("lead-123", "secret");
    expect(await verifyUnsubscribeToken(token, "wrong-secret")).toBeNull();
  });

  it("handles leadIds with dots correctly", async () => {
    const token = await signUnsubscribeToken("lead.with.dots", "secret");
    const leadId = await verifyUnsubscribeToken(token, "secret");
    expect(leadId).toBe("lead.with.dots");
  });
});
