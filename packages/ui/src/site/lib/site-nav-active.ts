import type { NavItem } from "../types";

export function normalizeSitePath(value: string | undefined): string | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;

  const path = value.split(/[?#]/, 1)[0];
  if (path.length === 0) return undefined;
  if (path === "/") return "/";

  return path.endsWith("/") ? path.slice(0, -1) : path;
}

export function isActiveSiteNavHref(
  currentPath: string | undefined,
  href: string | undefined,
): boolean {
  const normalizedCurrentPath = normalizeSitePath(currentPath);
  const normalizedHref = normalizeSitePath(href);

  if (!normalizedCurrentPath || !normalizedHref) return false;
  if (normalizedHref === "/") return normalizedCurrentPath === "/";

  return (
    normalizedCurrentPath === normalizedHref ||
    normalizedCurrentPath.startsWith(`${normalizedHref}/`)
  );
}

function isOtherTopLevelNavHref(
  href: string | undefined,
  item: NavItem,
  navItems: NavItem[],
): boolean {
  const normalizedHref = normalizeSitePath(href);
  if (!normalizedHref) return false;

  return navItems.some(
    (navItem) => navItem !== item && normalizeSitePath(navItem.href) === normalizedHref,
  );
}

export function isActiveSiteNavItem(
  currentPath: string | undefined,
  item: NavItem,
  navItems: NavItem[] = [],
): boolean {
  if (item.activePaths) {
    return item.activePaths.some((path) => isActiveSiteNavHref(currentPath, path));
  }

  if (isActiveSiteNavHref(currentPath, item.href)) return true;

  return (
    item.groups?.some((group) =>
      group.links.some(
        (link) =>
          !isOtherTopLevelNavHref(link.href, item, navItems) &&
          isActiveSiteNavHref(currentPath, link.href),
      ),
    ) ?? false
  );
}
