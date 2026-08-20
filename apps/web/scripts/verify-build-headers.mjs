import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { execSync } from "node:child_process";
import { stdout } from "node:process";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceHeadersPath = resolve(rootDir, "public/_headers");
const builtHeadersPath = resolve(rootDir, "dist/_headers");
const generatedRouteTreePath = resolve(rootDir, "src/routeTree.gen.ts");
const originalRouteTree = existsSync(generatedRouteTreePath)
  ? readFileSync(generatedRouteTreePath, "utf8")
  : null;

try {
  execSync("pnpm build", { cwd: rootDir, stdio: "inherit" });

  if (!existsSync(builtHeadersPath)) {
    throw new Error(`Expected ${builtHeadersPath} to exist after the web build.`);
  }

  const normalize = (value) => value.replace(/\r\n/g, "\n").trimEnd();
  const expected = normalize(readFileSync(sourceHeadersPath, "utf8"));
  const actual = normalize(readFileSync(builtHeadersPath, "utf8"));

  if (actual !== expected) {
    throw new Error(
      [
        "dist/_headers did not match public/_headers after build.",
        `Expected:\n${expected}`,
        `Actual:\n${actual}`,
      ].join("\n\n"),
    );
  }

  stdout.write("Verified dist/_headers exists and matches public/_headers.\n");
} finally {
  if (originalRouteTree !== null) {
    const currentRouteTree = existsSync(generatedRouteTreePath)
      ? readFileSync(generatedRouteTreePath, "utf8")
      : null;

    if (currentRouteTree !== originalRouteTree) {
      writeFileSync(generatedRouteTreePath, originalRouteTree);
    }
  }
}
