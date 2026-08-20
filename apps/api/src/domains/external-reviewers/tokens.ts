import { hmacSha256Hex, timingSafeEqualHex } from "../../lib/hmac";

/**
 * Signs a portal session token of the form `${sessionId}.${expiresAt}.${hex}`.
 *
 * The HMAC covers `portal:${sessionId}:${expiresAt}`, scoping the signature to
 * exactly this session and expiry so a token for one session cannot be repurposed
 * for another.
 *
 * @param sessionId - The portal session's unique identifier.
 * @param expiresAt - Unix epoch milliseconds at which the token expires.
 * @param secret    - HMAC signing secret (typically `PORTAL_TOKEN_SECRET`).
 */
export async function signPortalToken(
  sessionId: string,
  expiresAt: number,
  secret: string,
): Promise<string> {
  const hex = await hmacSha256Hex(secret, `portal:${sessionId}:${expiresAt}`);
  return `${sessionId}.${expiresAt}.${hex}`;
}

/**
 * Verifies a portal session token produced by `signPortalToken`.
 *
 * Returns `{ sessionId, expiresAt }` when the token is valid and not expired,
 * or `null` when it is invalid, tampered, or expired.
 *
 * Token format: `${sessionId}.${expiresAt}.${hex}` — the last two `.`-separated
 * segments (reading right-to-left) are hex and expiresAt. Everything left of that
 * is sessionId (which could contain dots).
 *
 * @param token  - The raw portal token string.
 * @param secret - HMAC signing secret (typically `PORTAL_TOKEN_SECRET`).
 */
export async function verifyPortalToken(
  token: string,
  secret: string,
): Promise<{ sessionId: string; expiresAt: number } | null> {
  // Split off the last two fields from the right: hex and expiresAt.
  // Everything left is sessionId (which could contain dots).
  const lastDot2 = nthLastIndexOf(token, ".", 2);
  if (lastDot2 <= 0) return null;

  const sessionId = token.slice(0, lastDot2);
  const rest = token.slice(lastDot2 + 1); // "expiresAt.hex"

  const dotIdx = rest.indexOf(".");
  // dotIdx < 0  → no dot found (no hex segment present)
  // dotIdx === 0 → dot is first char, meaning expiresAt would be empty string
  if (dotIdx <= 0 || dotIdx === rest.length - 1) return null;

  const expiresAtStr = rest.slice(0, dotIdx);
  const providedHex = rest.slice(dotIdx + 1);

  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt)) return null;

  // Check expiry before performing the HMAC comparison so we skip crypto work
  // for tokens that are already stale.
  if (expiresAt <= Date.now()) return null;

  const expectedHex = await hmacSha256Hex(secret, `portal:${sessionId}:${expiresAt}`);
  if (!timingSafeEqualHex(providedHex, expectedHex)) return null;

  return { sessionId, expiresAt };
}

/**
 * Hashes a raw portal token for storage in the database.
 *
 * The raw token is never stored; only this hash is persisted so that a DB
 * compromise cannot be used to forge valid tokens.
 *
 * Hash: HMAC-SHA256 of `store:${rawToken}` using the portal secret.
 *
 * @param rawToken - The raw portal token string.
 * @param secret   - HMAC signing secret (typically `PORTAL_TOKEN_SECRET`).
 */
export async function hashPortalTokenForStorage(rawToken: string, secret: string): Promise<string> {
  return hmacSha256Hex(secret, `store:${rawToken}`);
}

export async function createPortalSessionCredential(
  sessionId: string,
  expiresAt: number,
  secret: string,
): Promise<string> {
  const randomBytes = crypto.getRandomValues(new Uint8Array(32));
  const nonce = btoa(String.fromCharCode(...randomBytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  const signature = await hmacSha256Hex(
    secret,
    `portal-session:${sessionId}:${expiresAt}:${nonce}`,
  );
  return `${sessionId}.${expiresAt}.${nonce}.${signature}`;
}

export async function verifyPortalSessionCredential(
  credential: string,
  secret: string,
): Promise<{ sessionId: string; expiresAt: number } | null> {
  const sessionBoundary = nthLastIndexOf(credential, ".", 3);
  if (sessionBoundary <= 0) return null;

  const sessionId = credential.slice(0, sessionBoundary);
  const parts = credential.slice(sessionBoundary + 1).split(".");
  if (parts.length !== 3) return null;
  const [expiresAtText, nonce, providedSignature] = parts;
  const expiresAt = Number(expiresAtText);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now() || !nonce || !providedSignature) {
    return null;
  }
  const expectedSignature = await hmacSha256Hex(
    secret,
    `portal-session:${sessionId}:${expiresAt}:${nonce}`,
  );
  return timingSafeEqualHex(providedSignature, expectedSignature) ? { sessionId, expiresAt } : null;
}

/**
 * Returns the index of the nth-from-last occurrence of `char` in `str`,
 * or -1 if there are fewer than `n` occurrences.
 */
export function nthLastIndexOf(str: string, char: string, n: number): number {
  let remaining = n;
  let idx = str.length;
  while (remaining > 0) {
    idx = str.lastIndexOf(char, idx - 1);
    if (idx === -1) return -1;
    remaining -= 1;
  }
  return idx;
}
