const PACKAGE_MAP: Record<string, string> = {
  "apps/api": "@grantpipe/api",
  "apps/web": "@grantpipe/web",
  "apps/site": "@grantpipe/site",
  "packages/shared": "@grantpipe/shared",
  "packages/db": "@grantpipe/db",
  "packages/ui": "@grantpipe/ui",
};

const PACKAGE_DEPENDENTS: Record<string, string[]> = {
  "@grantpipe/shared": ["@grantpipe/api", "@grantpipe/web", "@grantpipe/site"],
  "@grantpipe/db": ["@grantpipe/api"],
  "@grantpipe/ui": ["@grantpipe/web", "@grantpipe/site"],
};

const ROOT_CHECK_CONFIG_FILES = new Set([
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "turbo.json",
  "tsconfig.base.json",
  "eslint.config.js",
  ".prettierrc.json",
  ".lintstagedrc.json",
  "scripts/vitest.config.ts",
  "playwright.config.ts",
  "playwright.site.config.ts",
]);

const PACKAGE_ORDER = [
  "@grantpipe/shared",
  "@grantpipe/db",
  "@grantpipe/ui",
  "@grantpipe/api",
  "@grantpipe/web",
  "@grantpipe/site",
];

export function getAffectedPackages(stagedFiles: string[]): string[] {
  const affected = new Set<string>();

  for (const file of stagedFiles) {
    if (ROOT_CHECK_CONFIG_FILES.has(file)) {
      return [...PACKAGE_ORDER];
    }

    for (const [prefix, packageName] of Object.entries(PACKAGE_MAP)) {
      if (file.startsWith(prefix)) {
        affected.add(packageName);
        for (const dependent of PACKAGE_DEPENDENTS[packageName] ?? []) {
          affected.add(dependent);
        }
      }
    }
  }

  return PACKAGE_ORDER.filter((packageName) => affected.has(packageName));
}
