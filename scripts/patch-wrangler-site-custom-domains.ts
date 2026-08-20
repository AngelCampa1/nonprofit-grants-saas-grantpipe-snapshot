import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { extractWorkerRoutes, mergeWorkerRoutes } from "./lib/wrangler-custom-domains";

function parseJsonc(src: string): unknown {
  const withoutComments = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const withoutTrailingCommas = withoutComments.replace(/,\s*([}\]])/g, "$1");
  return JSON.parse(withoutTrailingCommas);
}

const siteRoot = existsSync("wrangler.jsonc") ? "." : join("apps", "site");
const userConfigPath = join(siteRoot, "wrangler.jsonc");
const generatedConfigPath = join(siteRoot, "dist", "server", "wrangler.json");

if (!existsSync(userConfigPath)) {
  console.error(`User config not found: ${userConfigPath}`);
  process.exit(1);
}

if (!existsSync(generatedConfigPath)) {
  console.error(`Generated config not found: ${generatedConfigPath}`);
  process.exit(1);
}

const userConfig = parseJsonc(readFileSync(userConfigPath, "utf8")) as Record<string, unknown>;
const routes = extractWorkerRoutes(userConfig);

if (!routes.length) {
  process.exit(0);
}

const generated = JSON.parse(readFileSync(generatedConfigPath, "utf8")) as Record<string, unknown>;
const patched = mergeWorkerRoutes(generated, routes);
writeFileSync(generatedConfigPath, `${JSON.stringify(patched)}\n`);
console.log(
  `Injected routes into ${generatedConfigPath}: ${routes.map((r) => r.pattern).join(", ")}`,
);
