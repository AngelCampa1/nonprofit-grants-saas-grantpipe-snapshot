import { describe, expect, it } from "vitest";
import { handleAiSdrContext } from "./context.js";
import { hmacHex, buildHmacPayload, verifyHmacSignature, randomNonce } from "./signing.js";

const TEST_SECRET = "test-context-secret-key";

interface MockEnv {
  AI_SDR_CONTEXT_SECRET?: string;
}

async function makeSignedRequest(
  url: string,
  secret: string,
  body: Record<string, unknown> = {},
): Promise<Request> {
  const parsed = new URL(url);
  const path = `${parsed.pathname}${parsed.search}`;
  const timestamp = new Date().toISOString();
  const nonce = randomNonce();
  const payload = await buildHmacPayload({ timestamp, nonce, method: "GET", path, body });
  const signature = await hmacHex(payload, secret);

  return new Request(url, {
    method: "GET",
    headers: {
      "X-Ventora-Timestamp": timestamp,
      "X-Ventora-Nonce": nonce,
      "X-Ventora-Signature": signature,
    },
  });
}

describe("handleAiSdrContext", () => {
  it("returns 404 for an unknown productId", async () => {
    const req = await makeSignedRequest(
      "https://grantpipe.com/api/ai-sdr/context?productId=unknown",
      TEST_SECRET,
      { productId: "unknown" },
    );
    const env: MockEnv = { AI_SDR_CONTEXT_SECRET: TEST_SECRET };
    const res = await handleAiSdrContext({ request: req, env });
    expect(res.status).toBe(404);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("Unknown product");
  });

  it("returns 404 when productId query param is absent", async () => {
    const req = await makeSignedRequest(
      "https://grantpipe.com/api/ai-sdr/context",
      TEST_SECRET,
      {},
    );
    const env: MockEnv = { AI_SDR_CONTEXT_SECRET: TEST_SECRET };
    const res = await handleAiSdrContext({ request: req, env });
    expect(res.status).toBe(404);
  });

  it("returns 503 when AI_SDR_CONTEXT_SECRET is missing", async () => {
    const req = await makeSignedRequest(
      "https://grantpipe.com/api/ai-sdr/context?productId=grantpipe",
      TEST_SECRET,
      { productId: "grantpipe" },
    );
    const env: MockEnv = {};
    const res = await handleAiSdrContext({ request: req, env });
    expect(res.status).toBe(503);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("Product context unavailable");
  });

  it("returns 503 when AI_SDR_CONTEXT_SECRET is only whitespace", async () => {
    const req = await makeSignedRequest(
      "https://grantpipe.com/api/ai-sdr/context?productId=grantpipe",
      TEST_SECRET,
      { productId: "grantpipe" },
    );
    const env: MockEnv = { AI_SDR_CONTEXT_SECRET: "   " };
    const res = await handleAiSdrContext({ request: req, env });
    expect(res.status).toBe(503);
  });

  it("returns 401 when X-Ventora-Timestamp header is missing", async () => {
    const req = new Request("https://grantpipe.com/api/ai-sdr/context?productId=grantpipe", {
      method: "GET",
      headers: {
        "X-Ventora-Nonce": "abc",
        "X-Ventora-Signature": "a".repeat(64),
      },
    });
    const env: MockEnv = { AI_SDR_CONTEXT_SECRET: TEST_SECRET };
    const res = await handleAiSdrContext({ request: req, env });
    expect(res.status).toBe(401);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("Missing signature");
  });

  it("returns 401 when X-Ventora-Nonce header is missing", async () => {
    const req = new Request("https://grantpipe.com/api/ai-sdr/context?productId=grantpipe", {
      method: "GET",
      headers: {
        "X-Ventora-Timestamp": new Date().toISOString(),
        "X-Ventora-Signature": "a".repeat(64),
      },
    });
    const env: MockEnv = { AI_SDR_CONTEXT_SECRET: TEST_SECRET };
    const res = await handleAiSdrContext({ request: req, env });
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: string }).error).toBe("Missing signature");
  });

  it("returns 401 when X-Ventora-Signature header is missing", async () => {
    const req = new Request("https://grantpipe.com/api/ai-sdr/context?productId=grantpipe", {
      method: "GET",
      headers: {
        "X-Ventora-Timestamp": new Date().toISOString(),
        "X-Ventora-Nonce": "abc123",
      },
    });
    const env: MockEnv = { AI_SDR_CONTEXT_SECRET: TEST_SECRET };
    const res = await handleAiSdrContext({ request: req, env });
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: string }).error).toBe("Missing signature");
  });

  it("returns 401 when signature is invalid (bad secret)", async () => {
    // Sign with WRONG secret
    const req = await makeSignedRequest(
      "https://grantpipe.com/api/ai-sdr/context?productId=grantpipe",
      "wrong-secret",
      { productId: "grantpipe" },
    );
    const env: MockEnv = { AI_SDR_CONTEXT_SECRET: TEST_SECRET };
    const res = await handleAiSdrContext({ request: req, env });
    expect(res.status).toBe(401);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("Invalid signature");
  });

  it("returns 200 with product context on happy path with valid signature", async () => {
    const url = "https://grantpipe.com/api/ai-sdr/context?productId=grantpipe";
    const req = await makeSignedRequest(url, TEST_SECRET, { productId: "grantpipe" });
    const env: MockEnv = { AI_SDR_CONTEXT_SECRET: TEST_SECRET };
    const res = await handleAiSdrContext({ request: req, env });

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=300");
  });

  it("returns productId = 'grantpipe' in the response body", async () => {
    const url = "https://grantpipe.com/api/ai-sdr/context?productId=grantpipe";
    const req = await makeSignedRequest(url, TEST_SECRET, { productId: "grantpipe" });
    const env: MockEnv = { AI_SDR_CONTEXT_SECRET: TEST_SECRET };
    const res = await handleAiSdrContext({ request: req, env });

    const body = (await res.json()) as { productId: string; plans: unknown[]; sources: unknown[] };
    expect(body.productId).toBe("grantpipe");
    expect(Array.isArray(body.plans)).toBe(true);
    expect(Array.isArray(body.sources)).toBe(true);
  });

  it("keeps limited-offer context code-free", async () => {
    const url = "https://grantpipe.com/api/ai-sdr/context?productId=grantpipe";
    const req = await makeSignedRequest(url, TEST_SECRET, { productId: "grantpipe" });
    const env: MockEnv = { AI_SDR_CONTEXT_SECRET: TEST_SECRET };
    const res = await handleAiSdrContext({ request: req, env });

    const body = (await res.json()) as {
      plans: Array<{ discount: string; ctaUrl: string }>;
    };

    for (const plan of body.plans) {
      expect(plan.discount).toBe("");
      expect(plan.discount).not.toMatch(/\b[MY]80OFF\b/);
      const ctaUrl = new URL(plan.ctaUrl);
      expect(`${ctaUrl.origin}${ctaUrl.pathname}`).toBe("https://app.grantpipe.com/app/signup");
      expect(ctaUrl.searchParams.get("source_section")).toBe("ai-assistant");
      expect(ctaUrl.searchParams.get("cta_page_family")).toBe("ai-assistant");
      expect(ctaUrl.searchParams.get("cta_placement")).toBe("assistant-answer");
      expect(plan.ctaUrl).not.toContain("promo=");
    }
  });

  it("signs the response and the signature verifies", async () => {
    const url = "https://grantpipe.com/api/ai-sdr/context?productId=grantpipe";
    const req = await makeSignedRequest(url, TEST_SECRET, { productId: "grantpipe" });
    const env: MockEnv = { AI_SDR_CONTEXT_SECRET: TEST_SECRET };
    const res = await handleAiSdrContext({ request: req, env });

    const responseTs = res.headers.get("X-Ventora-Timestamp");
    const responseNonce = res.headers.get("X-Ventora-Nonce");
    const responseSig = res.headers.get("X-Ventora-Signature");

    expect(responseTs).toBeTruthy();
    expect(responseNonce).toMatch(/^[0-9a-f]{32}$/);
    expect(responseSig).toMatch(/^[0-9a-f]{64}$/);

    // Reconstruct the body and verify the response signature
    const responseBody = (await res.json()) as Record<string, unknown>;
    const parsed = new URL(url);
    const path = `${parsed.pathname}${parsed.search}`;

    const responsePayload = await buildHmacPayload({
      timestamp: responseTs!,
      nonce: responseNonce!,
      method: "GET",
      path,
      body: responseBody,
    });

    const valid = await verifyHmacSignature({
      payload: responsePayload,
      signature: responseSig!,
      secret: TEST_SECRET,
      timestamp: responseTs!,
    });
    expect(valid).toBe(true);
  });

  it("includes all 3 expected plan tiers in the response", async () => {
    const url = "https://grantpipe.com/api/ai-sdr/context?productId=grantpipe";
    const req = await makeSignedRequest(url, TEST_SECRET, { productId: "grantpipe" });
    const env: MockEnv = { AI_SDR_CONTEXT_SECRET: TEST_SECRET };
    const res = await handleAiSdrContext({ request: req, env });

    const body = (await res.json()) as { plans: Array<{ id: string }> };
    const tierIds = body.plans.map((p) => p.id);
    expect(tierIds).toContain("starter");
    expect(tierIds).toContain("growth");
    expect(tierIds).toContain("audit_ready");
  });
});
