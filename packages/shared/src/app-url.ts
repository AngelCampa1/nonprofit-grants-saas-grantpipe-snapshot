export const APP_BASE_PATH = "/app";

export function normalizeAppPath(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const appBoundary = normalizedPath.slice(APP_BASE_PATH.length, APP_BASE_PATH.length + 1);

  if (
    normalizedPath.startsWith(APP_BASE_PATH) &&
    (appBoundary === "" || appBoundary === "/" || appBoundary === "?" || appBoundary === "#")
  ) {
    return normalizedPath;
  }

  return `${APP_BASE_PATH}${normalizedPath}`;
}

export function buildAppUrl(appUrl: string, path: string): string {
  const normalizedBase = appUrl.replace(/\/+$/, "");
  const origin = normalizedBase.endsWith(APP_BASE_PATH)
    ? normalizedBase.slice(0, -APP_BASE_PATH.length)
    : normalizedBase;

  return `${origin}${normalizeAppPath(path)}`;
}
