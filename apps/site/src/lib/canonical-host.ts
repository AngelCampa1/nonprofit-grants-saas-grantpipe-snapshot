const WWW_HOST = "www.grantpipe.com";
const APEX_HOST = "grantpipe.com";

export function resolveCanonicalHostRedirect(url: URL): URL | null {
  if (url.hostname !== WWW_HOST) return null;

  const canonicalUrl = new URL(url);
  canonicalUrl.hostname = APEX_HOST;
  return canonicalUrl;
}
