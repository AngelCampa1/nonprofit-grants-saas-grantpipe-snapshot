const DEFAULT_OG_IMAGE = "/og-default.png";

const ROUTE_FAMILY_OG_IMAGES = [
  { route: "/resources/guides", image: "/og-guides.png" },
  { route: "/compare/alternatives", image: "/og-alternatives.png" },
  { route: "/compare/pricing", image: "/og-pricing.png" },
  { route: "/nonprofit-software", image: "/og-state-pages.png" },
  { route: "/solutions", image: "/og-solutions.png" },
] as const;

function normalizeCanonicalPath(canonicalPath: string): string {
  const [path] = canonicalPath.split(/[?#]/);
  if (!path) return "/";

  if (path !== "/" && path.endsWith("/")) {
    return path.replace(/\/+$/, "");
  }

  return path;
}

export function resolveGrantPipeOgImage(
  canonicalPath: string,
  fallbackOgImage = DEFAULT_OG_IMAGE,
): string {
  const normalizedPath = normalizeCanonicalPath(canonicalPath);
  const routeFamily = ROUTE_FAMILY_OG_IMAGES.find(
    ({ route }) => normalizedPath === route || normalizedPath.startsWith(`${route}/`),
  );

  return routeFamily?.image ?? fallbackOgImage;
}
