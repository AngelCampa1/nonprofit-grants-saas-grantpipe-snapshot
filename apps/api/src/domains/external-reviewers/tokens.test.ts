import { describe, it, expect } from "vitest";
import {
  signPortalToken,
  verifyPortalToken,
  hashPortalTokenForStorage,
  nthLastIndexOf,
  createPortalSessionCredential,
  verifyPortalSessionCredential,
} from "./tokens";

describe("portal session credentials", () => {
  it("creates distinct random credentials that verify for the same session", async () => {
    const expiresAt = Date.now() + 3_600_000;
    const first = await createPortalSessionCredential("session-1", expiresAt, "secret");
    const second = await createPortalSessionCredential("session-1", expiresAt, "secret");

    expect(first).not.toBe(second);
    await expect(verifyPortalSessionCredential(first, "secret")).resolves.toEqual({
      sessionId: "session-1",
      expiresAt,
    });
    await expect(verifyPortalSessionCredential(second, "secret")).resolves.toEqual({
      sessionId: "session-1",
      expiresAt,
    });
  });

  it("rejects emailed bearer tokens and tampered cookie credentials", async () => {
    const expiresAt = Date.now() + 3_600_000;
    const emailed = await signPortalToken("session-1", expiresAt, "secret");
    const credential = await createPortalSessionCredential("session-1", expiresAt, "secret");

    await expect(verifyPortalSessionCredential(emailed, "secret")).resolves.toBeNull();
    await expect(
      verifyPortalSessionCredential(`${credential.slice(0, -1)}0`, "secret"),
    ).resolves.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// nthLastIndexOf
// ---------------------------------------------------------------------------

describe("nthLastIndexOf", () => {
  it("returns the index of the last occurrence for n=1", () => {
    expect(nthLastIndexOf("a.b.c", ".", 1)).toBe(3);
  });

  it("returns the index of the 2nd-from-last occurrence for n=2", () => {
    expect(nthLastIndexOf("a.b.c", ".", 2)).toBe(1);
  });

  it("returns -1 when fewer than n occurrences exist", () => {
    expect(nthLastIndexOf("a.b", ".", 3)).toBe(-1);
    expect(nthLastIndexOf("nodots", ".", 1)).toBe(-1);
  });

  it("returns -1 on empty string", () => {
    expect(nthLastIndexOf("", ".", 1)).toBe(-1);
  });

  it("handles strings with dots only", () => {
    // "..." has 3 dots; n=2 → second-from-last → index 1
    expect(nthLastIndexOf("...", ".", 2)).toBe(1);
  });

  it("works when the char is at position 0", () => {
    // ".abc" — single dot at index 0; n=1 → 0
    expect(nthLastIndexOf(".abc", ".", 1)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// signPortalToken
// ---------------------------------------------------------------------------

describe("signPortalToken", () => {
  it("produces a token of the form sessionId.expiresAt.hex", async () => {
    const expiresAt = Date.now() + 3_600_000;
    const token = await signPortalToken("session-1", expiresAt, "secret");
    const parts = token.split(".");
    // At minimum three segments: sessionId, expiresAt, hex
    expect(parts.length).toBeGreaterThanOrEqual(3);
    expect(parts[0]).toBe("session-1");
    expect(parts[1]).toBe(String(expiresAt));
    expect(parts[2]).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for the same inputs", async () => {
    const expiresAt = 9_999_999_999_999;
    const a = await signPortalToken("s", expiresAt, "secret");
    const b = await signPortalToken("s", expiresAt, "secret");
    expect(a).toBe(b);
  });

  it("produces different tokens for different secrets", async () => {
    const expiresAt = 9_999_999_999_999;
    const a = await signPortalToken("s", expiresAt, "secretA");
    const b = await signPortalToken("s", expiresAt, "secretB");
    expect(a).not.toBe(b);
  });

  it("produces different tokens for different sessionIds", async () => {
    const expiresAt = 9_999_999_999_999;
    const a = await signPortalToken("session-1", expiresAt, "secret");
    const b = await signPortalToken("session-2", expiresAt, "secret");
    expect(a).not.toBe(b);
  });

  it("produces different tokens for different expiresAt values", async () => {
    const a = await signPortalToken("s", 1000, "secret");
    const b = await signPortalToken("s", 2000, "secret");
    expect(a).not.toBe(b);
  });

  it("handles sessionIds containing dots", async () => {
    const expiresAt = 9_999_999_999_999;
    const token = await signPortalToken("session.with.dots", expiresAt, "secret");
    expect(token.startsWith("session.with.dots.")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// verifyPortalToken
// ---------------------------------------------------------------------------

describe("verifyPortalToken", () => {
  it("returns sessionId and expiresAt for a valid non-expired token", async () => {
    const expiresAt = Date.now() + 3_600_000;
    const token = await signPortalToken("session-1", expiresAt, "secret");
    const result = await verifyPortalToken(token, "secret");
    expect(result).toEqual({ sessionId: "session-1", expiresAt });
  });

  it("round-trips a sessionId containing dots", async () => {
    const expiresAt = Date.now() + 3_600_000;
    const token = await signPortalToken("session.with.dots", expiresAt, "secret");
    const result = await verifyPortalToken(token, "secret");
    expect(result).toEqual({ sessionId: "session.with.dots", expiresAt });
  });

  it("returns null for an expired token", async () => {
    const expiresAt = Date.now() - 1_000;
    const token = await signPortalToken("session-1", expiresAt, "secret");
    const result = await verifyPortalToken(token, "secret");
    expect(result).toBeNull();
  });

  it("returns null when HMAC is tampered", async () => {
    const expiresAt = Date.now() + 3_600_000;
    const token = await signPortalToken("session-1", expiresAt, "secret");
    const replacement = token.endsWith("a") ? "b" : "a";
    const tampered = `${token.slice(0, -1)}${replacement}`;
    const result = await verifyPortalToken(tampered, "secret");
    expect(result).toBeNull();
  });

  it("returns null when verified with wrong secret", async () => {
    const expiresAt = Date.now() + 3_600_000;
    const token = await signPortalToken("session-1", expiresAt, "secret");
    const result = await verifyPortalToken(token, "wrong");
    expect(result).toBeNull();
  });

  it("returns null for a token with no dots", async () => {
    expect(await verifyPortalToken("nodots", "secret")).toBeNull();
  });

  it("returns null for a token with only one dot", async () => {
    expect(await verifyPortalToken("a.b", "secret")).toBeNull();
  });

  it("returns null for an empty token", async () => {
    expect(await verifyPortalToken("", "secret")).toBeNull();
  });

  it("returns null when expiresAt is empty (dotIdx === 0 in rest)", async () => {
    // "sessionId..hex" — rest after last2 = ".hex", dotIdx = 0
    expect(await verifyPortalToken("session-1..deadbeef", "secret")).toBeNull();
  });

  it("returns null when hex segment is empty (dotIdx at end of rest)", async () => {
    // "sessionId.123." — rest = "123.", dotIdx = 3 = rest.length - 1
    expect(await verifyPortalToken("session-1.123.", "secret")).toBeNull();
  });

  it("returns null when expiresAt is non-numeric", async () => {
    expect(await verifyPortalToken("session-1.notanumber.deadbeef", "secret")).toBeNull();
  });

  it("returns null when token has fewer than 2 dots (lastDot2 <= 0)", async () => {
    // Only one dot: lastDot2 returns -1 (fewer than 2 occurrences of '.')
    expect(await verifyPortalToken("session.hex", "secret")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// hashPortalTokenForStorage
// ---------------------------------------------------------------------------

describe("hashPortalTokenForStorage", () => {
  it("returns a 64-char lowercase hex string", async () => {
    const hash = await hashPortalTokenForStorage("some-raw-token", "secret");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for the same inputs", async () => {
    const a = await hashPortalTokenForStorage("token", "secret");
    const b = await hashPortalTokenForStorage("token", "secret");
    expect(a).toBe(b);
  });

  it("produces different hashes for different tokens", async () => {
    const a = await hashPortalTokenForStorage("token-a", "secret");
    const b = await hashPortalTokenForStorage("token-b", "secret");
    expect(a).not.toBe(b);
  });

  it("produces different hashes for different secrets", async () => {
    const a = await hashPortalTokenForStorage("token", "secret-a");
    const b = await hashPortalTokenForStorage("token", "secret-b");
    expect(a).not.toBe(b);
  });

  it("hash differs from the token HMAC used in signPortalToken", async () => {
    // Ensures the 'store:' prefix scopes the hash operation
    const expiresAt = Date.now() + 3_600_000;
    const rawToken = await signPortalToken("session-1", expiresAt, "secret");
    const storageHash = await hashPortalTokenForStorage(rawToken, "secret");
    // The storage hash must not equal the HMAC embedded in the token itself
    const embeddedHex = rawToken.split(".").at(-1)!;
    expect(storageHash).not.toBe(embeddedHex);
  });
});
