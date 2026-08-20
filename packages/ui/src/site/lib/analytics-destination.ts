export function destinationPathFromHref(href: string, origin?: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) && !/^https?:\/\//i.test(href)) {
    return "non_http";
  }

  try {
    const browserOrigin =
      typeof window !== "undefined" && typeof window.location.origin === "string"
        ? window.location.origin
        : "";
    const candidateOrigin = origin ?? browserOrigin;
    const baseOrigin = candidateOrigin.length > 0 ? candidateOrigin : "https://grantpipe.com";
    return new URL(href, baseOrigin).pathname;
  } catch {
    return "invalid";
  }
}
