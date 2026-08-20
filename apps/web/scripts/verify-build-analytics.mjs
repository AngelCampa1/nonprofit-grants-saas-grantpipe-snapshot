import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import process, { stderr, stdout } from "node:process";
import ts from "typescript";

const appRoot = process.cwd();
const wranglerPath = join(appRoot, "wrangler.jsonc");
const distAssetsPath = join(appRoot, "dist", "assets");

function fail(message) {
  stderr.write(`${message}\n`);
  process.exit(1);
}

if (!existsSync(wranglerPath)) {
  fail("Missing apps/web/wrangler.jsonc; cannot verify analytics build vars.");
}

if (!existsSync(distAssetsPath)) {
  fail("Missing apps/web/dist/assets; run the web build before verifying analytics.");
}

const parsed = ts.parseConfigFileTextToJson("wrangler.jsonc", readFileSync(wranglerPath, "utf8"));
if (parsed.error) {
  fail(ts.flattenDiagnosticMessageText(parsed.error.messageText, "\n"));
}

const vars = parsed.config?.vars ?? {};
const wranglerPosthogKey =
  typeof vars.VITE_POSTHOG_KEY === "string" ? vars.VITE_POSTHOG_KEY.trim() : "";
const wranglerPosthogHost =
  typeof vars.VITE_POSTHOG_HOST === "string" ? vars.VITE_POSTHOG_HOST.trim() : "";
const envPosthogKey = process.env.VITE_POSTHOG_KEY?.trim() ?? "";
const envPosthogHost = process.env.VITE_POSTHOG_HOST?.trim() ?? "";
const posthogKey = envPosthogKey || wranglerPosthogKey;
const posthogHost = envPosthogHost || wranglerPosthogHost;

if (!posthogKey) {
  fail("VITE_POSTHOG_KEY is missing or blank in env and wrangler.jsonc vars.");
}

const jsBundles = readdirSync(distAssetsPath)
  .filter((name) => name.endsWith(".js"))
  .map((name) => ({
    name,
    text: readFileSync(join(distAssetsPath, name), "utf8"),
  }));

if (jsBundles.length === 0) {
  fail("No JavaScript bundles found under apps/web/dist/assets.");
}

if (!jsBundles.some((bundle) => bundle.text.includes(posthogKey))) {
  fail("Built web bundle does not contain VITE_POSTHOG_KEY; PostHog will not initialize.");
}

if (posthogHost && !jsBundles.some((bundle) => bundle.text.includes(posthogHost))) {
  fail(
    "Built web bundle does not contain VITE_POSTHOG_HOST; PostHog host config was not embedded.",
  );
}

stdout.write("Web analytics build vars verified.\n");
