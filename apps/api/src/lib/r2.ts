import { hmacSha256Hex, timingSafeEqualHex } from "./hmac";

/**
 * Minimal interface for the subset of the R2Bucket API used by this module.
 * The full `R2Bucket` type from `@cloudflare/workers-types` is a superset —
 * accepting this narrower interface keeps the module testable without the full
 * workers-types package being available in test environments.
 */
export interface R2BucketLike {
  put(
    key: string,
    value: ArrayBuffer | Uint8Array,
    options?: { httpMetadata?: { contentType: string } },
  ): Promise<unknown>;
  get(
    key: string,
  ): Promise<{ body: ReadableStream; httpMetadata?: { contentType?: string } } | null>;
}

/**
 * Uploads a binary object to R2 with the given content type.
 *
 * @param bucket     - The R2 bucket binding.
 * @param key        - The R2 object key (e.g. `lead-magnets/my-guide.pdf`).
 * @param body       - The raw bytes to upload.
 * @param contentType - The MIME type (e.g. `application/pdf`).
 */
export async function uploadObject(
  bucket: R2BucketLike,
  key: string,
  body: ArrayBuffer | Uint8Array,
  contentType: string,
): Promise<void> {
  await bucket.put(key, body, { httpMetadata: { contentType } });
}

/**
 * Signs a download token of the form `${leadId}.${magnetSlug}.${expiresAt}.${hex}`.
 *
 * The HMAC covers `download:${leadId}:${magnetSlug}:${expiresAt}`, scoping the
 * signature to exactly this resource and expiry so a token for one lead/magnet
 * cannot be repurposed for another.
 *
 * @param leadId     - The lead's unique identifier.
 * @param magnetSlug - The slug of the lead magnet being downloaded.
 * @param expiresAt  - Unix epoch milliseconds at which the token expires.
 * @param secret     - HMAC signing secret (typically `DOWNLOAD_LINK_SECRET`).
 */
export async function signDownloadToken(
  leadId: string,
  magnetSlug: string,
  expiresAt: number,
  secret: string,
): Promise<string> {
  const hex = await hmacSha256Hex(secret, `download:${leadId}:${magnetSlug}:${expiresAt}`);
  return `${leadId}.${magnetSlug}.${expiresAt}.${hex}`;
}

/**
 * Verifies a download token produced by `signDownloadToken`.
 *
 * Returns `{ leadId, magnetSlug }` when the token is valid and not expired,
 * or `null` when it is invalid, tampered, or expired.
 *
 * Token format: `${leadId}.${magnetSlug}.${expiresAt}.${hex}` — the last
 * four `.`-separated segments, reading right-to-left, are hex, expiresAt,
 * magnetSlug, and leadId. This allows future-proofing where leadId or
 * magnetSlug might contain dots.
 */
export async function verifyDownloadToken(
  token: string,
  secret: string,
): Promise<{ leadId: string; magnetSlug: string } | null> {
  // Split off the last three fields from the right: hex, expiresAt, magnetSlug.
  // Everything left is leadId (which could contain dots).
  const lastDot3 = nthLastIndexOf(token, ".", 3);
  if (lastDot3 <= 0) return null;

  const leadId = token.slice(0, lastDot3);
  const rest = token.slice(lastDot3 + 1); // "magnetSlug.expiresAt.hex"

  const firstDot = rest.indexOf(".");
  if (firstDot <= 0) return null;
  const magnetSlug = rest.slice(0, firstDot);
  const afterSlug = rest.slice(firstDot + 1); // "expiresAt.hex"

  const lastDot = afterSlug.lastIndexOf(".");
  // lastDot < 0  → no dot found (no hex segment present)
  // lastDot === 0 → dot is first char, meaning expiresAt would be empty string
  if (lastDot < 0 || lastDot === 0 || lastDot === afterSlug.length - 1) return null;

  const expiresAtStr = afterSlug.slice(0, lastDot);
  const providedHex = afterSlug.slice(lastDot + 1);

  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt)) return null;

  // Check expiry before performing the HMAC comparison so we skip crypto work
  // for tokens that are already stale.
  if (expiresAt <= Date.now()) return null;

  const expectedHex = await hmacSha256Hex(secret, `download:${leadId}:${magnetSlug}:${expiresAt}`);
  if (!timingSafeEqualHex(providedHex, expectedHex)) return null;

  return { leadId, magnetSlug };
}

/**
 * Returns the index of the nth-from-last occurrence of `char` in `str`,
 * or -1 if there are fewer than `n` occurrences.
 */
function nthLastIndexOf(str: string, char: string, n: number): number {
  let remaining = n;
  let idx = str.length;
  while (remaining > 0) {
    idx = str.lastIndexOf(char, idx - 1);
    if (idx === -1) return -1;
    remaining -= 1;
  }
  return idx;
}
