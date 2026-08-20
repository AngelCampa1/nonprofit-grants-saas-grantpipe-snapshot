export const WORKER_BASE_URL = "https://ventora-ai-sdr-worker.example-account.workers.dev";

export const PRODUCT_ID = "grantpipe";

/**
 * Production origins that may call the signed AI-SDR proxy. Kept as an explicit
 * allowlist so prod stays locked down; dev and preview origins are matched
 * separately by {@link isAllowedOrigin}.
 */
export const ALLOWED_ORIGINS = ["https://grantpipe.com", "https://www.grantpipe.com"];

/** Cloudflare Pages project that serves preview deployments of the marketing site. */
const PAGES_PROJECT = "grantpipe-site";

/**
 * Returns true when the request Origin is allowed to use the AI-SDR proxy.
 *
 * Allowed:
 * - the explicit production {@link ALLOWED_ORIGINS}
 * - localhost / 127.0.0.1 dev origins on any port (http only)
 * - Cloudflare Pages preview deployments for this project
 *   (`https://<subdomain>.grantpipe-site.pages.dev`)
 *
 * The check parses the Origin into a URL and matches on the structured
 * protocol + hostname so look-alike hosts (e.g. `grantpipe.com.evil.com`)
 * cannot slip through a substring match.
 */
export function isAllowedOrigin(origin: string): boolean {
  if (ALLOWED_ORIGINS.includes(origin)) return true;

  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }

  const { protocol, hostname } = url;

  if ((hostname === "localhost" || hostname === "127.0.0.1") && protocol === "http:") {
    return true;
  }

  if (protocol === "https:") {
    const previewSuffix = `.${PAGES_PROJECT}.pages.dev`;
    if (hostname.endsWith(previewSuffix) && hostname.length > previewSuffix.length) {
      return true;
    }
  }

  return false;
}
