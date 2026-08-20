const legacyPositioningRedirects = new Map<string, string>([
  [
    "/resources/guides/grant-funded-nonprofit-operating-system/",
    "/resources/guides/grant-management-software-for-nonprofits/",
  ],
  ["/glossary/grant-funded-nonprofit-operating-system/", "/glossary/grant-compliance/"],
]);

function normalizeTrailingSlash(pathname: string): string {
  return pathname.endsWith("/") ? pathname : `${pathname}/`;
}

export function resolveLegacyPositioningRedirect(url: URL): URL | null {
  const targetPath = legacyPositioningRedirects.get(normalizeTrailingSlash(url.pathname));

  if (!targetPath) return null;

  const targetUrl = new URL(url);
  targetUrl.pathname = targetPath;
  targetUrl.search = "";
  targetUrl.hash = "";

  return targetUrl;
}
