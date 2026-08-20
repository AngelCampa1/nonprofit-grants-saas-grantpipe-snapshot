import { spawnSync } from "node:child_process";
import { join } from "node:path";

import { productionStressScripts } from "./lib/e2e-suite-inventory";

const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

for (const entry of productionStressScripts) {
  const scriptPath = join("e2e-adhoc", entry.file);
  const result = spawnSync(pnpmCommand, ["e2e:live", "--", "node", scriptPath], {
    cwd: process.cwd(),
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`Production stress suite failed: ${entry.file}`);
  }
}
