import { describe, expect, it } from "vitest";
import {
  stableJson,
  sha256Hex,
  hmacHex,
  buildHmacPayload,
  timingSafeEqual,
  verifyHmacSignature,
  randomNonce,
} from "./signing.js";

describe("stableJson", () => {
  it("serializes primitives normally", () => {
    expect(stableJson(42)).toBe("42");
    expect(stableJson("hello")).toBe('"hello"');
    expect(stableJson(true)).toBe("true");
    expect(stableJson(null)).toBe("null");
  });

  it("sorts object keys in code-unit (UTF-16) order, not locale order", () => {
    // Uppercase letters (A=65) sort before lowercase (a=97) in code-unit order
    const result = stableJson({ b: 1, A: 2, a: 3 });
    const parsed = JSON.parse(result) as Record<string, unknown>;
    const keys = Object.keys(parsed);
    expect(keys).toEqual(["A", "a", "b"]);
    expect(result).toBe('{"A":2,"a":3,"b":1}');
  });

  it("skips undefined values", () => {
    const result = stableJson({ a: 1, b: undefined, c: 3 });
    expect(result).toBe('{"a":1,"c":3}');
  });

  it("recurses into nested objects", () => {
    const result = stableJson({ z: { b: 2, a: 1 }, a: { y: 9, x: 8 } });
    const parsed = JSON.parse(result) as { a: Record<string, number>; z: Record<string, number> };
    expect(Object.keys(parsed)).toEqual(["a", "z"]);
    expect(Object.keys(parsed.a)).toEqual(["x", "y"]);
    expect(Object.keys(parsed.z)).toEqual(["a", "b"]);
  });

  it("recurses into arrays element-wise", () => {
    const result = stableJson([
      { b: 2, a: 1 },
      { d: 4, c: 3 },
    ]);
    expect(result).toBe('[{"a":1,"b":2},{"c":3,"d":4}]');
  });

  it("handles nested arrays within objects", () => {
    const result = stableJson({ b: [3, 2, 1], a: 0 });
    expect(result).toBe('{"a":0,"b":[3,2,1]}');
  });

  it("does NOT sort arrays (only object keys)", () => {
    const result = stableJson([3, 1, 2]);
    expect(result).toBe("[3,1,2]");
  });

  it("handles empty object", () => {
    expect(stableJson({})).toBe("{}");
  });

  it("handles empty array", () => {
    expect(stableJson([])).toBe("[]");
  });
});

describe("sha256Hex", () => {
  it("returns a 64-char lowercase hex string", async () => {
    const result = await sha256Hex("hello");
    expect(result).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns the known SHA-256 of 'hello'", async () => {
    // sha256("hello") = 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
    const result = await sha256Hex("hello");
    expect(result).toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
  });

  it("returns different hashes for different inputs", async () => {
    const a = await sha256Hex("foo");
    const b = await sha256Hex("bar");
    expect(a).not.toBe(b);
  });
});

describe("hmacHex", () => {
  it("returns a 64-char lowercase hex string", async () => {
    const result = await hmacHex("payload", "secret");
    expect(result).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for same inputs", async () => {
    const a = await hmacHex("payload", "secret");
    const b = await hmacHex("payload", "secret");
    expect(a).toBe(b);
  });

  it("differs when payload changes", async () => {
    const a = await hmacHex("payload1", "secret");
    const b = await hmacHex("payload2", "secret");
    expect(a).not.toBe(b);
  });

  it("differs when secret changes", async () => {
    const a = await hmacHex("payload", "secret1");
    const b = await hmacHex("payload", "secret2");
    expect(a).not.toBe(b);
  });
});

describe("buildHmacPayload", () => {
  it("returns the exact format: timestamp.nonce.METHOD.path.bodyHash", async () => {
    const timestamp = "2026-01-01T00:00:00.000Z";
    const nonce = "abc123";
    const method = "POST";
    const path = "/v1/sessions";
    const body = { productId: "grantpipe" };

    const result = await buildHmacPayload({ timestamp, nonce, method, path, body });
    const expectedBodyHash = await sha256Hex(stableJson(body));
    expect(result).toBe(`${timestamp}.${nonce}.POST.${path}.${expectedBodyHash}`);
  });

  it("uppercases the method", async () => {
    const result = await buildHmacPayload({
      timestamp: "2026-01-01T00:00:00.000Z",
      nonce: "abc",
      method: "post",
      path: "/v1/chat",
      body: {},
    });
    expect(result).toContain(".POST.");
  });

  it("uses stableJson for the body hash (key order independent)", async () => {
    const body1 = { b: 2, a: 1 };
    const body2 = { a: 1, b: 2 };
    const p1 = await buildHmacPayload({
      timestamp: "t",
      nonce: "n",
      method: "GET",
      path: "/p",
      body: body1,
    });
    const p2 = await buildHmacPayload({
      timestamp: "t",
      nonce: "n",
      method: "GET",
      path: "/p",
      body: body2,
    });
    expect(p1).toBe(p2);
  });
});

describe("timingSafeEqual", () => {
  it("returns true for equal strings", () => {
    expect(timingSafeEqual("abcdef", "abcdef")).toBe(true);
  });

  it("returns false for different strings of same length", () => {
    expect(timingSafeEqual("abcdef", "abcdeX")).toBe(false);
  });

  it("returns false for strings of different length", () => {
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
  });

  it("returns true for empty strings", () => {
    expect(timingSafeEqual("", "")).toBe(true);
  });
});

describe("verifyHmacSignature", () => {
  const secret = "test-secret-for-hmac-signing";

  async function makeValidSignature(
    timestamp: string,
    nonce: string,
    method: string,
    path: string,
    body: Record<string, unknown>,
  ): Promise<string> {
    const payload = await buildHmacPayload({ timestamp, nonce, method, path, body });
    return hmacHex(payload, secret);
  }

  it("accepts a valid signature within the time window", async () => {
    const nowMs = Date.now();
    const timestamp = new Date(nowMs).toISOString();
    const nonce = "testnonce123";
    const path = "/v1/sessions";
    const body = { sessionId: "abc" };
    const payload = await buildHmacPayload({ timestamp, nonce, method: "POST", path, body });
    const signature = await makeValidSignature(timestamp, nonce, "POST", path, body);

    const result = await verifyHmacSignature({ payload, signature, secret, timestamp, nowMs });
    expect(result).toBe(true);
  });

  it("rejects a signature with malformed hex (not 64 chars)", async () => {
    const timestamp = new Date().toISOString();
    const payload = "some.payload";
    const result = await verifyHmacSignature({
      payload,
      signature: "short",
      secret,
      timestamp,
    });
    expect(result).toBe(false);
  });

  it("rejects a signature with non-hex characters", async () => {
    const timestamp = new Date().toISOString();
    const payload = "some.payload";
    const fakeHex = "g".repeat(64);
    const result = await verifyHmacSignature({
      payload,
      signature: fakeHex,
      secret,
      timestamp,
    });
    expect(result).toBe(false);
  });

  it("rejects a timestamp that is not a valid date", async () => {
    const payload = "some.payload";
    const validSig = "a".repeat(64);
    const result = await verifyHmacSignature({
      payload,
      signature: validSig,
      secret,
      timestamp: "not-a-date",
    });
    expect(result).toBe(false);
  });

  it("rejects a timestamp outside the max skew window (too old)", async () => {
    const nowMs = Date.now();
    const oldMs = nowMs - 400_000; // 400s ago > 300s default maxSkewMs
    const timestamp = new Date(oldMs).toISOString();
    const nonce = "n";
    const path = "/v1/sessions";
    const body = {};
    const payload = await buildHmacPayload({ timestamp, nonce, method: "POST", path, body });
    const signature = await makeValidSignature(timestamp, nonce, "POST", path, body);

    const result = await verifyHmacSignature({ payload, signature, secret, timestamp, nowMs });
    expect(result).toBe(false);
  });

  it("accepts a timestamp within a custom maxSkewMs", async () => {
    const nowMs = Date.now();
    const timestamp = new Date(nowMs - 100).toISOString();
    const nonce = "n";
    const path = "/p";
    const body = {};
    const payload = await buildHmacPayload({ timestamp, nonce, method: "GET", path, body });
    const signature = await makeValidSignature(timestamp, nonce, "GET", path, body);

    const result = await verifyHmacSignature({
      payload,
      signature,
      secret,
      timestamp,
      maxSkewMs: 500,
      nowMs,
    });
    expect(result).toBe(true);
  });

  it("rejects a valid-looking signature that does not match the payload", async () => {
    const nowMs = Date.now();
    const timestamp = new Date(nowMs).toISOString();
    const nonce = "n";
    const path = "/p";
    const body = {};
    const payload = await buildHmacPayload({ timestamp, nonce, method: "GET", path, body });
    const wrongSig = await hmacHex("different-payload", secret);

    const result = await verifyHmacSignature({
      payload,
      signature: wrongSig,
      secret,
      timestamp,
      nowMs,
    });
    expect(result).toBe(false);
  });
});

describe("randomNonce", () => {
  it("returns a 32-char hex string (UUID without dashes)", () => {
    const nonce = randomNonce();
    expect(nonce).toMatch(/^[0-9a-f]{32}$/);
  });

  it("generates different values each time", () => {
    const a = randomNonce();
    const b = randomNonce();
    expect(a).not.toBe(b);
  });
});
