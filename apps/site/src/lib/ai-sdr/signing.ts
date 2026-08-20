export function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const sorted = Object.keys(obj)
      .sort()
      .filter((k) => obj[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stableJson(obj[k])}`)
      .join(",");
    return `{${sorted}}`;
  }
  return JSON.stringify(value);
}

export async function sha256Hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hmacHex(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function buildHmacPayload(input: {
  timestamp: string;
  nonce: string;
  method: string;
  path: string;
  body: Record<string, unknown>;
}): Promise<string> {
  const bodyHash = await sha256Hex(stableJson(input.body));
  return `${input.timestamp}.${input.nonce}.${input.method.toUpperCase()}.${input.path}.${bodyHash}`;
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export async function verifyHmacSignature(input: {
  payload: string;
  signature: string;
  secret: string;
  timestamp: string;
  maxSkewMs?: number;
  nowMs?: number;
}): Promise<boolean> {
  const { payload, signature, secret, timestamp, maxSkewMs = 300_000, nowMs } = input;
  if (!/^[0-9a-f]{64}$/.test(signature)) return false;
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return false;
  if (Math.abs((nowMs ?? Date.now()) - parsed) > maxSkewMs) return false;
  return timingSafeEqual(await hmacHex(payload, secret), signature);
}

export function randomNonce(): string {
  return crypto.randomUUID().replaceAll("-", "");
}
