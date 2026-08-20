const encoder = new TextEncoder();

/**
 * Computes HMAC-SHA256 over `message` using `secret` and returns the result
 * as a lowercase hex string. Uses the Web Crypto API (crypto.subtle) so it
 * works in Cloudflare Workers and other WinterCG-compliant runtimes.
 */
export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  // Fail closed if the secret is missing. The Workers runtime can supply an
  // undefined env binding even though the type says `string`; an empty key
  // would produce a known, forgeable HMAC. Guarding here covers every caller
  // (download + unsubscribe tokens) on both the sign and verify paths.
  if (!secret) {
    throw new Error("HMAC secret is required but was empty or undefined");
  }
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const buf = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  const bytes = new Uint8Array(buf);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}

/**
 * Compares two hex strings in constant time to prevent timing-based attacks.
 * Returns false immediately when lengths differ (length itself is not secret).
 */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Signs an unsubscribe token of the form `${leadId}.${hmacHex}`.
 * The HMAC covers `unsub:${leadId}` so that one leaked token only unsubscribes
 * one lead, and only the unsubscribe action.
 */
export async function signUnsubscribeToken(leadId: string, secret: string): Promise<string> {
  const hex = await hmacSha256Hex(secret, `unsub:${leadId}`);
  return `${leadId}.${hex}`;
}

/**
 * Verifies an unsubscribe token and returns the leadId if valid, or null.
 * Split on the LAST `.` so leadIds containing dots are handled correctly.
 */
export async function verifyUnsubscribeToken(
  token: string,
  secret: string,
): Promise<string | null> {
  const lastDot = token.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === token.length - 1) return null;
  const leadId = token.slice(0, lastDot);
  const providedHex = token.slice(lastDot + 1);
  const expectedHex = await hmacSha256Hex(secret, `unsub:${leadId}`);
  if (!timingSafeEqualHex(providedHex, expectedHex)) return null;
  return leadId;
}
