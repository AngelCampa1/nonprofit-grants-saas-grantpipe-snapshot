export type DeployTarget = "api" | "web" | "site";

const TARGET_ORDER: DeployTarget[] = ["api", "web", "site"];

const DIRECT_TARGET_PREFIXES: Array<{
  prefix: string;
  targets: DeployTarget[];
}> = [
  { prefix: "apps/api/src/scripts/sync-lead-magnets-to-r2.ts", targets: ["api", "site"] },
  { prefix: "apps/api/", targets: ["api"] },
  { prefix: "apps/web/", targets: ["web"] },
  { prefix: "apps/site/", targets: ["site"] },
  { prefix: "packages/db/", targets: ["api"] },
  { prefix: "packages/shared/", targets: ["api", "web", "site"] },
  { prefix: "packages/ui/", targets: ["web", "site"] },
];

const DIRECT_TARGET_FILES = new Map<string, DeployTarget[]>([
  ["scripts/deploy-api.ts", ["api"]],
  ["scripts/deploy-web.ts", ["web"]],
  ["scripts/deploy-site.ts", ["site"]],
  ["scripts/check-sentry-release-env.ts", ["web", "site"]],
  ["scripts/lib/local-env.ts", ["api", "web", "site"]],
  ["scripts/lib/wrangler-custom-domains.ts", ["site"]],
  ["scripts/patch-site-canonical-host-redirect.ts", ["site"]],
  ["scripts/patch-wrangler-site-custom-domains.ts", ["site"]],
  ["scripts/strip-missing-sourcemap-comments.ts", ["site"]],
]);

const ROOT_DEPLOY_CONFIG_FILES = new Set([
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "turbo.json",
  "tsconfig.base.json",
  "eslint.config.js",
  ".prettierrc.json",
  ".lintstagedrc.json",
  "playwright.config.ts",
  "playwright.site.config.ts",
  "scripts/deploy-changed.ts",
  "scripts/lib/deploy-targets.ts",
]);

export const DEPLOY_COMMANDS: Record<DeployTarget, string> = {
  api: "pnpm run deploy:api",
  web: "pnpm run deploy:web",
  site: "pnpm run deploy:site",
};

function isRootDeployConfig(file: string): boolean {
  return ROOT_DEPLOY_CONFIG_FILES.has(file);
}

export function getDeployTargets(changedFiles: string[]): DeployTarget[] {
  const selectedTargets = new Set<DeployTarget>();

  for (const file of changedFiles) {
    const directTargets = DIRECT_TARGET_FILES.get(file);
    if (directTargets) {
      for (const target of directTargets) {
        selectedTargets.add(target);
      }

      continue;
    }

    if (isRootDeployConfig(file)) {
      return [...TARGET_ORDER];
    }

    for (const entry of DIRECT_TARGET_PREFIXES) {
      if (!file.startsWith(entry.prefix)) {
        continue;
      }

      for (const target of entry.targets) {
        selectedTargets.add(target);
      }
    }
  }

  return TARGET_ORDER.filter((target) => selectedTargets.has(target));
}

export function getDeployCommands(targets: DeployTarget[]): string[] {
  return targets.map((target) => DEPLOY_COMMANDS[target]);
}
